const { baseURL } = require("../../config.js");

Page({
  data: {
    tempFilePath: "",
    fileName: "",
    header_row: 1,
    use_std: false,
    sigma: 0,
    loading: false,
    syncPath: "",
    asyncPath: ""
  },

  // 选择文件
  pickFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["xlsx"], // 不需要点号
      success: (res) => {
        const f = res.tempFiles[0];
        this.setData({
          tempFilePath: f.path,
          fileName: f.name || "已选择文件"
        });
      },
      fail: () => wx.showToast({ title: "选择失败", icon: "none" })
    });
  },

  // 参数变化
  onHeaderRow(e) { this.setData({ header_row: Number(e.detail.value || 1) }); },
  onUseStd(e)     { this.setData({ use_std: e.detail.value }); },
  onSigma(e)      { this.setData({ sigma: Number(e.detail.value || 0) }); },

  // 开始分析
  startAnalyze() {
    const { tempFilePath, header_row, use_std, sigma } = this.data;
    if (!tempFilePath) {
      wx.showToast({ title: "请先选择文件", icon: "none" });
      return;
    }

    this.setData({ loading: true, syncPath: "", asyncPath: "" });
    wx.showLoading({ title: "分析中…" });

    wx.uploadFile({
      url: `${baseURL}/analyze`,
      filePath: tempFilePath,
      name: "file",
      // ！！必须用字符串
      formData: {
        header_row: String(header_row),
        use_std: use_std ? "true" : "false",
        sigma: String(sigma)
      },
      timeout: 600000, // 10 分钟，大文件更稳
      success: (resp) => {
        try {
          const data = JSON.parse(resp.data || "{}");
          if (data.error) {
            wx.showModal({ title: "分析出错", content: data.error, showCancel: false });
            return;
          }

          // base64 → 本地文件
          const fs = wx.getFileSystemManager();
          const base = wx.env.USER_DATA_PATH;
          const syncPath  = `${base}/sync_2dcos.png`;
          const asyncPath = `${base}/async_2dcos.png`;
          fs.writeFileSync(syncPath,  data.sync_png,  "base64");
          fs.writeFileSync(asyncPath, data.async_png, "base64");

          this.setData({ syncPath, asyncPath });
          wx.showToast({ title: "分析完成", icon: "success" });

          // 下一帧滚动到结果区（WXML 里给同步卡片加 id="syncCard"）
          wx.nextTick(() => {
            wx.pageScrollTo({ selector: '#syncCard', duration: 300 });
          });
        } catch (e) {
          console.error(e);
          wx.showModal({ title: "解析失败", content: String(e), showCancel: false });
        }
      },
      fail: (e) => {
        console.error(e);
        wx.showModal({
          title: "网络错误",
          content: e.errMsg || "请检查服务器域名白名单或网络",
          showCancel: false
        });
      },
      complete: () => {
        this.setData({ loading: false });
        wx.hideLoading();
      }
    });
  },

  // 保存图片（带权限处理）
  saveSync()  { this.saveImage(this.data.syncPath);  },
  saveAsync() { this.saveImage(this.data.asyncPath); },

  saveImage(path) {
    if (!path) return;
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
      fail: (err) => {
        // 首次拒绝或系统限制时，引导去设置
        if (err && err.errMsg && err.errMsg.includes("auth deny")) {
          wx.showModal({
            title: "需要授权",
            content: "请允许保存到相册权限后重试",
            success: (res) => {
              if (res.confirm) {
                wx.openSetting({});
              }
            }
          });
        } else {
          wx.showToast({ title: "保存失败", icon: "none" });
        }
      }
    });
  }
});
