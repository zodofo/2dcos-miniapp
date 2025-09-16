import { API_BASE } from "../../config"

Page({
  data: {
    header_row: 1,       // 表头行索引
    use_std: false,      // 是否使用相关系数
    sigma: 0,            // 高斯平滑参数
    filePath: "",        // Excel 临时路径
    fileName: "未选择文件",
    loading: false,      // 是否加载中
    syncPath: "",        // 同步谱图像路径
    asyncPath: ""        // 异步谱图像路径
  },

  // 选择文件
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: [".xlsx"],
      success: (res) => {
        const file = res.tempFiles[0]
        this.setData({
          filePath: file.path,
          fileName: file.name
        })
      }
    })
  },

  // 输入框绑定
  onHeader(e) {
    this.setData({ header_row: Number(e.detail.value || 0) })
  },

  onStd(e) {
    this.setData({ use_std: e.detail.value })
  },

  onSigma(e) {
    this.setData({ sigma: Number(e.detail.value) })
  },

  // 上传并分析
  submit() {
    if (!this.data.filePath) {
      wx.showToast({ title: "请先选择 .xlsx 文件", icon: "none" })
      return
    }

    this.setData({ loading: true, syncPath: "", asyncPath: "" })

    wx.uploadFile({
      url: `${API_BASE}/analyze`,
      filePath: this.data.filePath,
      name: "file",
      formData: {
        header_row: String(this.data.header_row),
        use_std: String(this.data.use_std),
        sigma: String(this.data.sigma)
      },
      timeout: 600000,  // 超时时间
      success: (resp) => {
        try {
          const data = JSON.parse(resp.data)

          if (data.error) {
            wx.showModal({ title: "出错了", content: data.error, showCancel: false })
            return
          }

          const fs = wx.getFileSystemManager()
          const base = wx.env.USER_DATA_PATH
          const syncPath = `${base}/sync_2dcos.png`
          const asyncPath = `${base}/async_2dcos.png`

          fs.writeFileSync(syncPath, data.sync_png, "base64")
          fs.writeFileSync(asyncPath, data.async_png, "base64")

          this.setData({ syncPath, asyncPath })

          if (data.tags && data.tags.length) {
            wx.showToast({ title: `检测到 ${data.tags.length} 组标签`, icon: "none" })
          }
        } catch (e) {
          wx.showModal({ title: "解析失败", content: String(e), showCancel: false })
        }
      },
      fail: (e) => {
        wx.showModal({ title: "网络错误", content: String(e.errMsg || e), showCancel: false })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  // 保存图像
  saveSync() {
    this.saveImage(this.data.syncPath)
  },

  saveAsync() {
    this.saveImage(this.data.asyncPath)
  },

  saveImage(path) {
    if (!path) return
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        wx.showToast({ title: "已保存到相册" })
      },
      fail: (e) => {
        wx.showModal({
          title: "保存失败",
          content: e.errMsg || "请在设置中允许保存到相册",
          showCancel: false
        })
      }
    })
  }
})
