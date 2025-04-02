// 配置常量
const AVIF_CONFIG = {
    quality: 80,
    speed: 5,
    lossless: false,
    chroma: 420
};

// 初始化数据库
const db = new Dexie('ImageDatabase');
db.version(1).stores({
    images: '++id, name, size, uploadDate, tags, url, thumbUrl, width, height'
});

// DOM元素
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileSelectBtn = document.getElementById('fileSelectBtn');
const uploadQueue = document.getElementById('uploadQueue');
const queueItems = document.getElementById('queueItems');
const galleryGrid = document.getElementById('galleryGrid');
const searchInput = document.getElementById('searchInput');
const notificationContainer = document.getElementById('notificationContainer');
const themeToggle = document.getElementById('themeToggle');

// 全局状态
let uploadQueueItems = [];
let avifWorker = null;

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadGallery();
    checkSystemTheme();
});

// 初始化事件监听器
function initEventListeners() {
    // 拖放上传
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-blue-500', 'bg-blue-50/50');
        dropZone.classList.remove('border-gray-300', 'dark:border-gray-600');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
        dropZone.classList.add('border-gray-300', 'dark:border-gray-600');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-blue-500', 'bg-blue-50/50');
        dropZone.classList.add('border-gray-300', 'dark:border-gray-600');

        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    // 文件选择上传
    fileSelectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleFiles(fileInput.files);
        }
    });

    // 粘贴上传
    document.addEventListener('paste', (e) => {
        if (e.clipboardData.files.length > 0) {
            handleFiles(e.clipboardData.files);
        } else if (e.clipboardData.items) {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    handleFiles([blob]);
                    break;
                }
            }
        }
    });

    // 主题切换
    themeToggle.addEventListener('click', toggleTheme);

    // 搜索功能
    searchInput.addEventListener('input', debounce(searchImages, 300));
}

// 处理上传文件
async function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => file.type.match('image.*'));

    if (validFiles.length === 0) {
        showNotification('请选择有效的图片文件', 'error');
        return;
    }

    // 显示上传队列
    uploadQueue.classList.remove('hidden');

    // 添加到上传队列
    for (const file of validFiles) {
        const queueItem = {
            id: generateId(),
            file,
            status: 'pending',
            progress: 0
        };

        uploadQueueItems.push(queueItem);
        renderQueueItem(queueItem);

        // 处理并上传文件
        processAndUploadFile(queueItem);
    }
}

// 处理并上传文件
async function processAndUploadFile(queueItem) {
    try {
        // 更新状态为处理中
        updateQueueItemStatus(queueItem.id, 'processing');

        // 创建缩略图
        const thumbBlob = await createThumbnail(queueItem.file);
        const thumbUrl = URL.createObjectURL(thumbBlob);

        // 转换为AVIF格式
        //   const avifBlob = await convertToAVIF(queueItem.file, (progress) => {
        //     updateQueueItemProgress(queueItem.id, progress * 50); // 转换占50%进度
        //   });
        const avifBlob = queueItem.file
        // 上传文件
        const uploadResponse = await uploadFile(avifBlob, {
            id: queueItem.id,
            name: queueItem.file.name.replace(/\.[^/.]+$/, ""), // 移除扩展名
            size: avifBlob.size,
            type: avifBlob.type,
            thumbUrl
        }, (progress) => {
            updateQueueItemProgress(queueItem.id, 50 + progress * 0); // 上传占50%进度
        });

        // 保存到数据库
        const imageData = {
            name: queueItem.file.name,
            size: avifBlob.size,
            uploadDate: new Date(),
            url: uploadResponse.downloadUrl,
            thumbUrl,
            width: uploadResponse.width,
            height: uploadResponse.height
        };

        await db.images.add(imageData);

        // 更新状态为完成
        updateQueueItemStatus(queueItem.id, 'completed');

        // 添加到图库
        addImageToGallery(imageData);

        showNotification(`${queueItem.file.name} 上传成功`, 'success');
    } catch (error) {
        console.error('上传失败:', error);
        updateQueueItemStatus(queueItem.id, 'failed');
        showNotification(`${queueItem.file.name} 上传失败: ${error.message}`, 'error');
    }
}

// 转换为AVIF格式
async function convertToAVIF(file, progressCallback) {
    return new Promise((resolve, reject) => {
        if (!avifWorker) {
            avifWorker = new Worker('avif-worker.js');
        }

        const reader = new FileReader();
        reader.onload = () => {
            const imageData = new Uint8Array(reader.result);

            avifWorker.postMessage({
                action: 'encode',
                imageData,
                config: AVIF_CONFIG
            });

            avifWorker.onmessage = (e) => {
                if (e.data.progress) {
                    progressCallback(e.data.progress);
                } else if (e.data.result) {
                    const avifBlob = new Blob([e.data.result], { type: 'image/avif' });
                    resolve(avifBlob);
                } else if (e.data.error) {
                    reject(new Error(e.data.error));
                }
            };
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

// 创建缩略图
function createThumbnail(file, maxWidth = 200, maxHeight = 200) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 计算缩略图尺寸
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // 绘制缩略图
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                resolve(blob);
                URL.revokeObjectURL(url);
            }, 'image/jpeg', 0.7);
        };

        img.src = url;
    });
}

// 上传文件到服务器
async function uploadFile(blob, meta, progressCallback) {
    const formData = new FormData();
    formData.append('file', blob, `${meta.name}.avif`);

    // 显示进度指示器
    showProgressIndicator(meta.id);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const progress = Math.round((e.loaded / e.total) * 100);
                progressCallback(progress);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                resolve({
                    downloadUrl: response.data.downloadPage,
                    width: meta.width,
                    height: meta.height
                });
            } else {
                reject(new Error(`上传失败: ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => {
            reject(new Error('网络错误，上传失败'));
        };

        xhr.open('POST', 'https://store1.gofile.io/contents/uploadfile', true);
        xhr.send(formData);
    });
}

// 加载图库
async function loadGallery() {
    try {
        const images = await db.images.orderBy('uploadDate').reverse().toArray();
        galleryGrid.innerHTML = '';

        if (images.length === 0) {
            galleryGrid.innerHTML = `
          <div class="col-span-full text-center py-12">
            <i class="fas fa-images text-4xl text-gray-300 mb-4"></i>
            <p class="text-gray-500">暂无图片，上传你的第一张图片吧</p>
          </div>
        `;
            return;
        }

        images.forEach(image => addImageToGallery(image));
    } catch (error) {
        console.error('加载图库失败:', error);
        showNotification('加载图库失败', 'error');
    }
}

// 添加图片到图库
function addImageToGallery(image) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 card-hover';
    card.innerHTML = `
      <div class="relative aspect-square overflow-hidden">
        <img src="${image.thumbUrl}" alt="${image.name}" class="w-full h-full object-cover" loading="lazy">
        <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
          <span class="text-white text-sm truncate">${image.name}</span>
        </div>
      </div>
      <div class="p-3 flex items-center justify-between">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          ${formatFileSize(image.size)}
        </div>
        <div class="flex space-x-2">
          <button class="p-1 text-gray-500 hover:text-blue-500 transition-colors copy-btn" data-url="${image.url}">
            <i class="fas fa-copy"></i>
          </button>
          <button class="p-1 text-gray-500 hover:text-red-500 transition-colors delete-btn" data-id="${image.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;

    // 添加事件监听器
    const copyBtn = card.querySelector('.copy-btn');
    const deleteBtn = card.querySelector('.delete-btn');

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(image.url);
        showNotification('链接已复制到剪贴板', 'success');
    });

    deleteBtn.addEventListener('click', () => deleteImage(image.id));

    galleryGrid.prepend(card);
}

// 删除图片
async function deleteImage(id) {
    try {
        // 从数据库删除
        await db.images.delete(id);

        // 从DOM删除
        const card = document.querySelector(`[data-id="${id}"]`)?.closest('.card');
        if (card) {
            card.classList.add('opacity-0', 'scale-95');
            setTimeout(() => card.remove(), 300);
        }

        showNotification('图片已删除', 'success');
    } catch (error) {
        console.error('删除图片失败:', error);
        showNotification('删除图片失败', 'error');
    }
}

// 搜索图片
async function searchImages() {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        loadGallery();
        return;
    }

    try {
        const images = await db.images
            .filter(image =>
                image.name.toLowerCase().includes(query) ||
                (image.tags && image.tags.some(tag => tag.toLowerCase().includes(query)))
                    .toArray());

        galleryGrid.innerHTML = '';

        if (images.length === 0) {
            galleryGrid.innerHTML = `
          <div class="col-span-full text-center py-12">
            <i class="fas fa-search text-4xl text-gray-300 mb-4"></i>
            <p class="text-gray-500">没有找到匹配的图片</p>
          </div>
        `;
            return;
        }

        images.forEach(image => addImageToGallery(image));
    } catch (error) {
        console.error('搜索失败:', error);
        showNotification('搜索失败', 'error');
    }
}

// 渲染上传队列项
function renderQueueItem(item) {
    const queueItem = document.createElement('div');
    queueItem.id = `queue-item-${item.id}`;
    queueItem.className = 'bg-white dark:bg-gray-800 rounded-lg p-3 shadow-xs flex items-center';
    queueItem.innerHTML = `
      <div class="flex-shrink-0 w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center mr-3">
        <i class="fas fa-image text-gray-400"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between mb-1">
          <p class="text-sm font-medium truncate">${item.file.name}</p>
          <span class="text-xs text-gray-500">${formatFileSize(item.file.size)}</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div class="bg-blue-500 h-1.5 rounded-full" style="width: ${item.progress}%"></div>
        </div>
        <div class="flex items-center justify-between mt-1">
          <span class="text-xs text-gray-500 status-text">等待中...</span>
          <span class="text-xs text-gray-500">${item.progress}%</span>
        </div>
      </div>
    `;

    queueItems.appendChild(queueItem);
}

// 更新上传队列项状态
function updateQueueItemStatus(id, status) {
    const item = uploadQueueItems.find(item => item.id === id);
    if (!item) return;

    item.status = status;
    const statusElement = document.querySelector(`#queue-item-${id} .status-text`);

    if (statusElement) {
        let statusText = '';
        let statusColor = 'text-gray-500';

        switch (status) {
            case 'processing':
                statusText = '处理中...';
                statusColor = 'text-blue-500';
                break;
            case 'uploading':
                statusText = '上传中...';
                statusColor = 'text-blue-500';
                break;
            case 'completed':
                statusText = '已完成';
                statusColor = 'text-green-500';
                break;
            case 'failed':
                statusText = '失败';
                statusColor = 'text-red-500';
                break;
            default:
                statusText = '等待中...';
        }

        statusElement.textContent = statusText;
        statusElement.className = `text-xs ${statusColor} status-text`;
    }
}

// 更新上传队列项进度
function updateQueueItemProgress(id, progress) {
    const item = uploadQueueItems.find(item => item.id === id);
    if (!item) return;

    item.progress = Math.round(progress);

    const progressBar = document.querySelector(`#queue-item-${id} .bg-blue-500`);
    const progressText = document.querySelector(`#queue-item-${id} span:last-child`);

    if (progressBar) {
        progressBar.style.width = `${item.progress}%`;
    }

    if (progressText) {
        progressText.textContent = `${item.progress}%`;
    }

    if (progress > 0 && progress < 100) {
        updateQueueItemStatus(id, 'uploading');
    }
}

// 显示进度指示器
function showProgressIndicator(id) {
    const item = uploadQueueItems.find(item => item.id === id);
    if (!item) return;

    const indicator = document.createElement('div');
    indicator.id = `progress-indicator-${id}`;
    indicator.className = 'fixed bottom-4 left-4 w-12 h-12 z-50';
    indicator.innerHTML = `
      <svg class="progress-ring w-full h-full" viewBox="0 0 36 36">
        <circle class="progress-ring__circle stroke-gray-200 dark:stroke-gray-700" stroke-width="2" fill="transparent" r="16" cx="18" cy="18"/>
        <circle class="progress-ring__circle stroke-blue-500" stroke-width="2" fill="transparent" r="16" cx="18" cy="18" stroke-dasharray="100 100" stroke-dashoffset="100"/>
      </svg>
    `;

    document.body.appendChild(indicator);

    // 更新进度
    const circle = indicator.querySelector('.stroke-blue-500');
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    const updateProgress = (progress) => {
        const offset = circumference - (progress / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    };

    updateProgress(0);

    // 移除指示器
    return {
        update: updateProgress,
        remove: () => {
            indicator.style.opacity = '0';
            setTimeout(() => indicator.remove(), 300);
        }
    };
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 flex items-start max-w-xs border-l-4 ${type === 'error' ? 'border-red-500' : type === 'success' ? 'border-green-500' : 'border-blue-500'} transform transition-all duration-300 translate-x-8 opacity-0`;

    let icon = '';
    let iconColor = '';

    switch (type) {
        case 'error':
            icon = 'exclamation-circle';
            iconColor = 'text-red-500';
            break;
        case 'success':
            icon = 'check-circle';
            iconColor = 'text-green-500';
            break;
        case 'warning':
            icon = 'exclamation-triangle';
            iconColor = 'text-yellow-500';
            break;
        default:
            icon = 'info-circle';
            iconColor = 'text-blue-500';
    }

    notification.innerHTML = `
      <i class="fas fa-${icon} ${iconColor} mt-0.5 mr-3"></i>
      <div class="flex-1">
        <p class="text-sm font-medium">${message}</p>
      </div>
      <button class="ml-2 text-gray-400 hover:text-gray-500 close-btn">
        <i class="fas fa-times"></i>
      </button>
    `;

    notificationContainer.appendChild(notification);

    // 显示动画
    setTimeout(() => {
        notification.classList.remove('translate-x-8', 'opacity-0');
        notification.classList.add('translate-x-0', 'opacity-100');
    }, 10);

    // 自动消失
    const autoDismiss = setTimeout(() => {
        dismissNotification(notification);
    }, 5000);

    // 关闭按钮
    const closeBtn = notification.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        clearTimeout(autoDismiss);
        dismissNotification(notification);
    });

    function dismissNotification(notification) {
        notification.classList.remove('translate-x-0', 'opacity-100');
        notification.classList.add('translate-x-8', 'opacity-0');

        setTimeout(() => {
            notification.remove();
        }, 300);
    }
}

// 主题切换
function checkSystemTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// 工具函数
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}