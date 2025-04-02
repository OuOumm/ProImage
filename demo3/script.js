/**
 * 极速图床 - 前端核心脚本
 * 功能：文件上传、管理、预览、删除等全套图床功能
 * 特性：拖放上传、分块上传、上传队列、进度显示、响应式设计
 */

document.addEventListener('DOMContentLoaded', function () {
    // DOM 元素引用
    const uploadProgress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const fileGrid = document.getElementById('fileGrid');
    const searchBox = document.querySelector('.search-box');
    const viewButtons = document.querySelectorAll('.view-btn');

    // 配置常量
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const maxFileSize = 20 * 1024 * 1024; // 20MB
    const CHUNK_SIZE = 5 * 1024 * 1024; // 分块大小5MB
    const MAX_CONCURRENT_UPLOADS = 3; // 最大并发上传数

    // 上传队列类
    class UploadQueue {
        constructor(maxConcurrent = 3) {
            this.queue = [];
            this.activeUploads = 0;
            this.maxConcurrent = maxConcurrent;
        }

        add(file, completeCallback, progressCallback) {
            this.queue.push({ file, completeCallback, progressCallback });
            this.processQueue();
        }

        processQueue() {
            while (this.queue.length > 0 && this.activeUploads < this.maxConcurrent) {
                const { file, completeCallback, progressCallback } = this.queue.shift();
                this.activeUploads++;

                this.uploadFile(file, (result) => {
                    this.activeUploads--;
                    completeCallback(result);
                    this.processQueue();
                }, progressCallback);
            }
        }

        async uploadFile(file, completeCallback, progressCallback) {
            const fileId = generateFileId();
            const chunks = Math.ceil(file.size / CHUNK_SIZE);
            let uploadedChunks = 0;

            try {
                for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
                    const start = chunkIndex * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const chunk = file.slice(start, end);

                    const formData = new FormData();
                    formData.append('file', chunk);
                    formData.append('fileId', fileId);
                    formData.append('chunkIndex', chunkIndex);
                    formData.append('totalChunks', chunks);
                    formData.append('fileName', file.name);
                    formData.append('fileSize', file.size);
                    formData.append('fileType', file.type);

                    await this.uploadChunk(formData);

                    uploadedChunks++;
                    if (progressCallback) {
                        progressCallback(Math.round((uploadedChunks / chunks) * 100));
                    }
                }

                // 所有分块上传完成，通知服务器合并
                const mergeResponse = await fetch('/api/merge-chunks', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fileId,
                        fileName: file.name,
                        fileType: file.type,
                        totalChunks: chunks
                    })
                });

                const mergeResult = await mergeResponse.json();

                if (mergeResult.success) {
                    completeCallback({ success: true, data: mergeResult.data });
                } else {
                    completeCallback({ success: false, error: mergeResult.error });
                }
            } catch (error) {
                console.error('上传失败:', error);
                completeCallback({ success: false, error: error.message });
            }
        }

        async uploadChunk(formData) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.open('POST', '/api/upload-chunk', true);

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        resolve();
                    } else {
                        reject(new Error(`上传失败: ${xhr.statusText}`));
                    }
                };

                xhr.onerror = () => {
                    reject(new Error('网络错误'));
                };

                xhr.send(formData);
            });
        }
    }

    // 工具函数
    function generateFileId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 上传队列实例
    const uploadQueue = new UploadQueue(MAX_CONCURRENT_UPLOADS);
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    // 初始化事件监听
    initEventListeners();

    // 加载初始文件列表
    loadFileList();

    // 初始化所有事件监听器
    function initEventListeners() {
        // 拖放上传功能
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        uploadArea.addEventListener('drop', handleDrop);

        // 点击上传功能
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);

        // 搜索功能
        searchBox.addEventListener('input', debounce(handleSearch, 300));

        // 视图切换
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                viewButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                fileGrid.className = btn.querySelector('i').classList.contains('fa-th-large') ?
                    'file-grid' : 'file-list';
            });
        });
    }

    // 拖放相关处理函数
    function handleDragOver(e) {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary-color)';
        uploadArea.style.backgroundColor = 'rgba(67, 97, 238, 0.1)';
    }

    function handleDragLeave() {
        uploadArea.style.borderColor = '#ccc';
        uploadArea.style.backgroundColor = 'transparent';
    }

    function handleDrop(e) {
        e.preventDefault();
        handleDragLeave();

        if (e.dataTransfer.files.length) {
            handleFiles(e.dataTransfer.files);
        }
    }

    // 文件选择处理
    function handleFileSelect() {
        if (fileInput.files.length) {
            handleFiles(fileInput.files);
        }
    }

    // 主文件处理函数
    function handleFiles(files) {
        uploadProgress.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '准备上传...';

        const validFiles = Array.from(files).filter(file => {
            // 文件类型验证
            if (!allowedTypes.includes(file.type)) {
                showToast(`文件 ${file.name} 类型不支持`, 'error');
                return false;
            }

            // 文件大小验证
            if (file.size > maxFileSize) {
                showToast(`文件 ${file.name} 超过20MB限制`, 'error');
                return false;
            }

            return true;
        });

        if (validFiles.length === 0) return;

        // 初始化上传进度跟踪
        const uploadState = {
            totalFiles: validFiles.length,
            completedFiles: 0,
            totalChunks: validFiles.reduce((sum, file) => sum + Math.ceil(file.size / CHUNK_SIZE), 0),
            completedChunks: 0
        };

        // 添加到上传队列
        validFiles.forEach(file => {
            uploadQueue.add(file, (result) => {
                uploadState.completedFiles++;

                if (result.success) {
                    addFileToGrid(result.data);
                    showToast(`${file.name} 上传成功`, 'success');
                } else {
                    showToast(`${file.name} 上传失败: ${result.error || '未知错误'}`, 'error');
                }

                // 更新总进度
                const percent = Math.round((uploadState.completedFiles / uploadState.totalFiles) * 100);
                updateProgress(percent, `上传进度: ${uploadState.completedFiles}/${uploadState.totalFiles}`);

                // 全部完成
                if (uploadState.completedFiles === uploadState.totalFiles) {
                    progressText.textContent = '上传完成!';
                    setTimeout(() => {
                        uploadProgress.style.display = 'none';
                    }, 2000);
                }
            }, (chunkProgress) => {
                // 分块进度回调
                uploadState.completedChunks += chunkProgress;
                const overallPercent = Math.round(
                    (uploadState.completedChunks / uploadState.totalChunks) * 100
                );
                updateProgress(overallPercent, `上传中: ${file.name} (${chunkProgress}%)`);
            });
        });
    }

    // 更新进度条
    function updateProgress(percent, text) {
        progressBar.style.width = `${percent}%`;
        progressText.textContent = text;
    }

    // 添加文件到网格
    function addFileToGrid(fileData) {
        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';
        fileCard.dataset.fileId = fileData.id;
        fileCard.dataset.fileName = fileData.name.toLowerCase();

        fileCard.innerHTML = `
            <div class="file-thumbnail">
                <img src="${fileData.thumbnailUrl || fileData.url}" alt="${fileData.name}" loading="lazy">
            </div>
            <div class="file-info">
                <div class="file-name">${fileData.name}</div>
                <div class="file-meta">
                    <span>${formatSize(fileData.size)}</span>
                    <span>${formatDate(fileData.uploadTime)}</span>
                </div>
                <div class="file-actions">
                    <button class="action-btn copy-link" title="复制链接">
                        <i class="fas fa-link"></i>
                    </button>
                    <button class="action-btn preview-image" title="预览">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn delete-file" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${fileData.url.endsWith('.gif') ? `
                    <button class="action-btn copy-markdown" title="复制Markdown">
                        <i class="fas fa-code"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;

        // 添加事件监听器
        fileCard.querySelector('.copy-link').addEventListener('click', () => copyLink(fileData.url));
        fileCard.querySelector('.preview-image').addEventListener('click', () => previewImage(fileData.url));
        fileCard.querySelector('.delete-file').addEventListener('click', (e) => deleteFile(fileData.id, e.target));
        if (fileData.url.endsWith('.gif')) {
            fileCard.querySelector('.copy-markdown').addEventListener('click', () => copyMarkdown(fileData.url));
        }

        // 插入到网格开头
        if (fileGrid.firstChild) {
            fileGrid.insertBefore(fileCard, fileGrid.firstChild);
        } else {
            fileGrid.appendChild(fileCard);
        }
    }

    // 加载文件列表
    async function loadFileList() {
        try {
            const response = await fetch('/api/files');
            const data = await response.json();

            if (data.success && data.files) {
                fileGrid.innerHTML = '';
                data.files.forEach(file => addFileToGrid(file));
            }
        } catch (error) {
            console.error('加载文件列表失败:', error);
            showToast('加载文件列表失败', 'error');
        }
    }

    // 搜索处理
    function handleSearch() {
        const searchTerm = searchBox.value.trim().toLowerCase();
        const cards = document.querySelectorAll('.file-card');

        cards.forEach(card => {
            const fileName = card.dataset.fileName;
            const matches = fileName.includes(searchTerm);
            card.style.display = matches ? '' : 'none';
        });
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    function debounce(func, wait) {
        let timeout;
        return function () {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

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
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    // 全局函数（现在作为模块内函数）
    function copyLink(url) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('链接已复制到剪贴板', 'success');
        }).catch(err => {
            console.error('复制失败:', err);
            showToast('复制链接失败', 'error');
        });
    }

    function copyMarkdown(url) {
        const markdown = `![image](${url})`;
        navigator.clipboard.writeText(markdown).then(() => {
            showToast('Markdown已复制', 'success');
        }).catch(err => {
            console.error('复制失败:', err);
            showToast('复制Markdown失败', 'error');
        });
    }

    function previewImage(url) {
        const modal = document.createElement('div');
        modal.className = 'image-preview-modal';

        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn">&times;</span>
                <img src="${url}" alt="预览">
                <div class="toolbar">
                    <button class="copy-link-btn"><i class="fas fa-link"></i> 复制链接</button>
                    <button class="open-new-btn"><i class="fas fa-external-link-alt"></i> 新窗口打开</button>
                </div>
            </div>
        `;

        modal.querySelector('.close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('.copy-link-btn').addEventListener('click', () => copyLink(url));
        modal.querySelector('.open-new-btn').addEventListener('click', () => window.open(url, '_blank'));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        document.body.appendChild(modal);
    }

    async function deleteFile(fileId, btn) {
        if (!confirm('确定要删除这个文件吗？此操作不可恢复。')) return;

        try {
            const card = btn.closest('.file-card');
            card.style.opacity = '0.5';
            btn.disabled = true;

            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                card.style.transition = 'all 0.3s ease';
                card.style.height = `${card.offsetHeight}px`;
                card.style.margin = '0';
                card.style.padding = '0';
                card.style.border = 'none';

                setTimeout(() => {
                    card.style.height = '0';
                    card.style.opacity = '0';

                    setTimeout(() => {
                        card.remove();
                    }, 300);
                }, 10);

                showToast('文件已删除', 'success');
            } else {
                card.style.opacity = '1';
                btn.disabled = false;
                showToast(`删除失败: ${data.error || '未知错误'}`, 'error');
            }
        } catch (error) {
            console.error('删除文件失败:', error);
            showToast('删除文件失败', 'error');
            btn.closest('.file-card').style.opacity = '1';
            btn.disabled = false;
        }
    }
});