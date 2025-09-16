import io, re, base64
import numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, BoundaryNorm
from scipy.signal import hilbert
from scipy.ndimage import gaussian_filter
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import matplotlib
import base64
print("DEBUG: sync_png head =", base64.b64encode(sync_png)[:60], flush=True)
print("DEBUG: async_png head =", base64.b64encode(async_png)[:60], flush=True)

matplotlib.rcParams['font.sans-serif'] = ['SimHei', 'NotoSansSC', 'Arial Unicode MS']
matplotlib.rcParams['axes.unicode_minus'] = False


cmap = LinearSegmentedColormap.from_list(
    "GreenWhiteRed", ["#005700","#66cc66","#ffffff","#ff9999","#7f0000"], N=256
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

def natural_key(s: str):
    m = re.search(r"(\d+)", s)
    return int(m.group(1)) if m else float("inf")

def process_file_bytes(data: bytes, header_row: int, use_std: bool, sigma: int):
    df = pd.read_excel(io.BytesIO(data), header=header_row)
    df.rename(columns={df.columns[0]: "wavelength"}, inplace=True)
    df = (df.dropna(subset=["wavelength"])
            .assign(wavelength=lambda x: pd.to_numeric(x["wavelength"], errors="coerce"))
            .sort_values("wavelength").reset_index(drop=True))
    df = df.loc[:, ~df.columns.str.startswith("Unnamed")]
    df.columns = df.columns.str.strip()

    wls = df["wavelength"].to_numpy()
    spectra = df.drop(columns="wavelength")
    prefix = spectra.columns.str.replace(r"\.\d+$","", regex=True)
    tags = sorted(prefix.unique(), key=natural_key)
    Y = np.vstack([spectra.loc[:, prefix==tag].mean(axis=1).to_numpy() for tag in tags])

    if np.isnan(Y).any():
        raise ValueError("数据包含 NaN，可能列标签分组有误。")

    if use_std:
        std = Y.std(axis=0, ddof=1); std[std==0] = 1
        Yp = (Y - Y.mean(0)) / std; cbar_lbl = "相关系数 ρ"
    else:
        Yp = Y - Y.mean(0); cbar_lbl = "协方差 (arb. u.)"

    m = Yp.shape[0]
    sync = (Yp.T @ Yp) / (m-1)
    async_ = (Yp.T @ np.imag(hilbert(Yp, axis=0))) / (m-1)
    async_ = 0.5*(async_ - async_.T)

    if sigma>0:
        sync = gaussian_filter(sync, sigma)
        async_ = gaussian_filter(async_, sigma)

    vmax = np.percentile(np.abs(async_), 99)
    pos = np.linspace(0.05*vmax, vmax, 6)
    levels = np.concatenate([-pos[::-1],[0],pos])
    norm = BoundaryNorm(levels, 256, clip=True)
    return wls, sync, async_, levels, norm, cbar_lbl, tags

def plot_matrix(wls, mat, title, levels, norm, cbar_lbl):
    fig, ax = plt.subplots(figsize=(6,5), dpi=150)
    cf = ax.contourf(wls, wls, mat, levels=levels, cmap=cmap, norm=norm, extend="both")
    ax.contour(wls, wls, mat, levels=levels, colors="k", linewidths=0.4)
    ax.set_xlabel("发射波长 / nm"); ax.set_ylabel("发射波长 / nm"); ax.set_title(title)
    fig.colorbar(cf, ticks=np.unique(levels), label=cbar_lbl)
    fig.tight_layout()

    # —— 调试：也保存一份到容器文件系统，便于在日志里确认非空
    try:
        fig.savefig(f"debug_{'sync' if '同步' in title else 'async'}.png", dpi=300)
        print("DEBUG: saved debug PNG for", title, flush=True)
    except Exception as e:
        print("DEBUG: failed to save debug PNG:", e, flush=True)

    buf = io.BytesIO(); fig.savefig(buf, format="png", dpi=300); plt.close(fig)
    return buf.getvalue()


@app.get("/healthz")
def ok(): return {"ok": True}

@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    header_row: int = Form(1),
    use_std: bool = Form(False),
    sigma: int = Form(0),
):
    try:
        data = await file.read()
        wls, sync, async_, levels, norm, cbar_lbl, tags = process_file_bytes(
            data, header_row, use_std, sigma
        )
        sync_png = plot_matrix(wls, sync, "同步二维相关光谱", levels, norm, cbar_lbl)
        async_png = plot_matrix(wls, async_, "异步二维相关光谱", levels, norm, cbar_lbl)

        # 👉 就在这里加打印，调试输出前 60 个 base64 字符
        import base64
        print("DEBUG: sync_png head =", base64.b64encode(sync_png)[:60], flush=True)
        print("DEBUG: async_png head =", base64.b64encode(async_png)[:60], flush=True)

        return JSONResponse({
            "tags": tags,
            "sync_png": base64.b64encode(sync_png).decode(),
            "async_png": base64.b64encode(async_png).decode()
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)

