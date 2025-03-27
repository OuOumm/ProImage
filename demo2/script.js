// DOM元素
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.querySelector('.upload-progress');
const progressFill = document.querySelector('.progress-fill');
const progressText = document.querySelector('.progress-text');
const fileList = document.querySelector('.file-list');
const fileCount = document.querySelector('.file-count span');
const viewButtons = document.querySelectorAll('.view-btn');
const searchInput = document.querySelector('.search-box input');
const previewModal = document.getElementById('previewModal');
const modalImage = document.getElementById('modalImage');
const imageUrlInput = document.getElementById('imageUrl');
const copyBtn = document.getElementById('copyBtn');
const closeModal = document.querySelector('.modal-close');
const deleteBtn = document.querySelector('.btn-delete');
const downloadBtn = document.querySelector('.btn-download');

// 状态变量
let files = [];
let currentView = 'grid';
let currentPreviewId = null;
let uploadQueue = [];
let isUploading = false;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 加载示例文件
    loadSampleFiles();
    renderFileList();
    
    // 事件监听
    fileInput.addEventListener('change', handleFileSelect);
    
    // 拖放上传
    const uploadCard = document.querySelector('.upload-card');
    uploadCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadCard.classList.add('drag-over');
    });
    
    uploadCard.addEventListener('dragleave', () => {
        uploadCard.classList.remove('drag-over');
    });
    
    uploadCard.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadCard.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
    
    // 视图切换
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            viewButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            fileList.className = `file-list ${currentView}-view`;
        });
    });
    
    // 搜索功能
    searchInput.addEventListener('input', () => {
        renderFileList(searchInput.value.toLowerCase());
    });
    
    // 模态框事件
    closeModal.addEventListener('click', closeImagePreview);
    copyBtn.addEventListener('click', copyImageUrl);
    deleteBtn.addEventListener('click', deleteCurrentImage);
    downloadBtn.addEventListener('click', downloadCurrentImage);
    
    // 点击模态框外部关闭
    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closeImagePreview();
        }
    });
});

// 加载示例文件
function loadSampleFiles() {
    files = [
        { 
            id: '1', 
            name: '示例图片1.jpg', 
            url: 'https://picsum.photos/800/600?random=1', 
            size: '1.2MB', 
            uploadedAt: '2023-05-15',
            type: 'image/jpeg'
        },
        { 
            id: '2', 
            name: '示例图片2.png', 
            url: 'https://picsum.photos/800/600?random=2', 
            size: '2.5MB', 
            uploadedAt: '2023-05-16',
            type: 'image/png'
        },
        { 
            id: '3', 
            name: '示例图片3.webp', 
            url: 'https://picsum.photos/800/600?random=3', 
            size: '0.8MB', 
            uploadedAt: '2023-05-17',
            type: 'image/webp'
        },
        { 
            id: '4', 
            name: '示例图片4.jpg', 
            url: 'https://picsum.photos/800/600?random=4', 
            size: '1.5MB', 
            uploadedAt: '2023-05-18',
            type: 'image/jpeg'
        },
        { 
            id: '5', 
            name: '示例图片5.png', 
            url: 'https://picsum.photos/800/600?random=5', 
            size: '3.2MB', 
            uploadedAt: '2023-05-19',
            type: 'image/png'
        },
        { 
            id: '6', 
            name: '示例图片6.jpg', 
            url: 'https://picsum.photos/800/600?random=6', 
            size: '1.7MB', 
            uploadedAt: '2023-05-20',
            type: 'image/jpeg'
        }
    ];
}

// 处理文件选择
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files);
        fileInput.value = ''; // 重置input
    }
}

// 处理文件
function handleFiles(selectedFiles) {
    const validFiles = Array.from(selectedFiles).filter(file => {
        const isValidType = /^image\/(jpeg|png|gif|webp)$/.test(file.type);
        const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB限制
        
        if (!isValidType) {
            showToast(`文件 ${file.name} 不是支持的图片格式 (JPEG, PNG, GIF, WEBP)`, 'error');
            return false;
        }
        
        if (!isValidSize) {
            showToast(`文件 ${file.name} 超过10MB大小限制`, 'error');
            return false;
        }
        
        return true;
    });
    
    if (validFiles.length > 0) {
        uploadQueue.push(...validFiles);
        processUploadQueue();
    }
}

// 处理上传队列
function processUploadQueue() {
    if (isUploading || uploadQueue.length === 0) return;
    
    isUploading = true;
    const file = uploadQueue.shift();
    uploadFile(file);
}

// 上传文件
function uploadFile(file) {
    // 显示上传进度
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = `正在上传: ${file.name}`;
    
    // 模拟上传过程
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            
            // 模拟上传完成
            setTimeout(() => {
                uploadComplete(file);
            }, 500);
        }
        
        progressFill.style.width = `${progress}%`;
    }, 200);
}

// 上传完成
function uploadComplete(file) {
    // 生成预览URL (实际项目中应从服务器响应获取)
    const randomId = Math.floor(Math.random() * 1000);
    const fileUrl = `https://picsum.photos/800/600?random=${randomId}`;
    
    // 添加到文件列表
    const newFile = {
        id: Date.now().toString(),
        name: file.name,
        url: fileUrl,
        size: formatFileSize(file.size),
        uploadedAt: new Date().toISOString().split('T')[0],
        type: file.type
    };
    
    files.unshift(newFile);
    renderFileList();
    
    // 更新上传状态
    progressText.textContent = `${file.name} 上传完成`;
    showToast('文件上传成功', 'success');
    
    // 重置上传状态
    setTimeout(() => {
        uploadProgress.style.display = 'none';
        isUploading = false;
        processUploadQueue(); // 处理队列中的下一个文件
    }, 1500);
}

// 渲染文件列表
function renderFileList(searchTerm = '') {
    const filteredFiles = searchTerm 
        ? files.filter(file => file.name.toLowerCase().includes(searchTerm))
        : files;
    
    fileList.innerHTML = '';
    
    filteredFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.id = file.id;
        
        fileItem.innerHTML = `
            <img src="${file.url}" class="file-thumbnail" alt="${file.name}">
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">
                    <span>${file.size}</span>
                    <span>${file.uploadedAt}</span>
                </div>
            </div>
            <div class="file-actions">
                <button class="action-btn preview-btn" title="预览">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn delete-btn" title="删除">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // 添加事件监听
        const previewBtn = fileItem.querySelector('.preview-btn');
        const deleteBtn = fileItem.querySelector('.delete-btn');
        
        previewBtn.addEventListener('click', () => previewImage(file.id));
        deleteBtn.addEventListener('click', () => deleteImage(file.id));
        
        fileList.appendChild(fileItem);
    });
    
    // 更新文件计数
    fileCount.textContent = filteredFiles.length;
}

// 预览图片
function previewImage(fileId) {
    const file = files.find(f => f.id === fileId);
    if (file) {
        currentPreviewId = fileId;
        modalImage.src = file.url;
        imageUrlInput.value = file.url;
        previewModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // 防止背景滚动
    }
}

// 关闭图片预览
function closeImagePreview() {
    previewModal.classList.remove('active');
    document.body.style.overflow = '';
}

// 复制图片链接
function copyImageUrl() {
    imageUrlInput.select();
    document.execCommand('copy');
    
    // 显示复制成功提示
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
    
    setTimeout(() => {
        copyBtn.innerHTML = originalText;
    }, 2000);
}

// 删除当前预览的图片
function deleteCurrentImage() {
    if (currentPreviewId) {
        deleteImage(currentPreviewId);
        closeImagePreview();
    }
}

// 下载当前预览的图片
function downloadCurrentImage() {
    if (currentPreviewId) {
        const file = files.find(f => f.id === currentPreviewId);
        if (file) {
            const link = document.createElement('a');
            link.href = file.url;
            link.download = file.name;
            link.click();
        }
    }
}

// 删除图片
function deleteImage(fileId) {
    if (confirm('确定要删除这张图片吗？')) {
        files = files.filter(f => f.id !== fileId);
        renderFileList();
        showToast('图片已删除', 'success');
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 显示提示消息
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// 添加CSS样式到head
const style = document.createElement('style');
style.textContent = `
.toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 1001;
}

.toast.show {
    opacity: 1;
}

.toast-success {
    background: #34a853;
}

.toast-error {
    background: #ea4335;
}

.toast-info {
    background: #4285f4;
}
`;
document.head.appendChild(style);