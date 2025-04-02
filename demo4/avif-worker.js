// 引入libavif.js
importScripts('libheif.js');

self.onmessage = async function(e) {
  const { action, imageData, config } = e.data;
  
  if (action === 'encode') {
    try {
      // 解码原始图片
      const decoder = new libavif.AVIFDecoder();
      const decodedImage = await decoder.decode(imageData);
      
      // 编码为AVIF
      const encoder = new libavif.AVIFEncoder();
      
      // 应用配置
      encoder.setQuality(config.quality);
      encoder.setSpeed(config.speed);
      encoder.setChromaSubsampling(config.chroma);
      
      // 进度回调
      encoder.setProgressCallback((progress) => {
        self.postMessage({ progress: progress * 0.9 }); // 编码占90%进度
      });
      
      // 编码
      const avifData = await encoder.encode(decodedImage);
      
      // 完成
      self.postMessage({ result: avifData });
    } catch (error) {
      self.postMessage({ error: error.message });
    }
  }
};