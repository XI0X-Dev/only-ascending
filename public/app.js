// State
let faceRefFile = null;
let targetFiles = [];
let apiKey = ''; // Loaded from Supabase after login
let queue = [];
let currentPreview = { rowIndex: 0, varIndex: 0 };
let selectedDimensions = '3072*4096';
let currentUser = '';

// ============================================
// AUTH - NEW SUPABASE SYSTEM
// ============================================

async function loginUser() {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const errorDiv = document.getElementById('loginError');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.username;
      apiKey = data.apiKey; // Load API key from database
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      sessionStorage.setItem('authenticated', 'true');
      sessionStorage.setItem('user', currentUser);
      sessionStorage.setItem('apiKey', apiKey);
      
      // Auto-fill API key
      document.getElementById('apiKeyInput').value = apiKey;
      showStatus('apiStatus', 'API KEY LOADED FROM ACCOUNT', 'success');
    } else {
      errorDiv.textContent = 'INVALID CREDENTIALS';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    errorDiv.textContent = 'CONNECTION ERROR';
    errorDiv.style.display = 'block';
  }
}

function logout() {
  sessionStorage.clear();
  apiKey = '';
  location.reload();
}

// Check auth on load
if (sessionStorage.getItem('authenticated') === 'true') {
  currentUser = sessionStorage.getItem('user');
  apiKey = sessionStorage.getItem('apiKey');
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  
  // Auto-fill API key
  if (apiKey) {
    document.getElementById('apiKeyInput').value = apiKey;
  }
}

// Enter key handlers
document.getElementById('passwordInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loginUser();
});
document.getElementById('usernameInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('passwordInput').focus();
});

// ============================================
// API KEY (No Auto-Save)
// ============================================

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (key) {
    apiKey = key; // Store in memory only, not localStorage
    showStatus('apiStatus', 'API KEY AUTHORIZED', 'success');
  } else {
    showStatus('apiStatus', 'INVALID KEY FORMAT', 'error');
  }
}

function showStatus(id, message, type) {
  const statusDiv = document.getElementById(id);
  statusDiv.textContent = message;
  statusDiv.className = `status-message ${type}`;
  statusDiv.style.display = 'block';
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

document.getElementById('apiKeyInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveApiKey();
});

// ============================================
// FACE REFERENCE UPLOAD
// ============================================

const faceDropzone = document.getElementById('faceDropzone');
const faceInput = document.getElementById('faceInput');

faceDropzone?.addEventListener('click', () => faceInput.click());

faceDropzone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  faceDropzone.classList.add('dragover');
});

faceDropzone?.addEventListener('dragleave', () => {
  faceDropzone.classList.remove('dragover');
});

faceDropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  faceDropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFaceUpload(e.dataTransfer.files[0]);
  }
});

faceInput?.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFaceUpload(e.target.files[0]);
  }
});

function handleFaceUpload(file) {
  // Check file size (1.91MB max)
  const maxSize = 1.91 * 1024 * 1024; // 1.91MB in bytes
  if (file.size > maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    alert(`FILE TOO LARGE!\n\nMaximum allowed: 1.91MB\nYour file size: ${fileSizeMB}MB\n\nPlease compress or resize the image before uploading.`);
    return;
  }
  
  faceRefFile = file;
  const preview = document.getElementById('facePreview');
  preview.innerHTML = `
    <div class="preview-image">
      <img src="${URL.createObjectURL(file)}" alt="Face">
      <button onclick="removeFace()" class="remove-btn">×</button>
    </div>
  `;
  faceDropzone.style.display = 'none';
  updateCreateButton();
}

function removeFace() {
  faceRefFile = null;
  document.getElementById('facePreview').innerHTML = '';
  faceDropzone.style.display = 'flex';
  updateCreateButton();
}

// ============================================
// TARGET IMAGES UPLOAD
// ============================================

const targetDropzone = document.getElementById('targetDropzone');
const targetInput = document.getElementById('targetInput');

targetDropzone?.addEventListener('click', () => targetInput.click());

targetDropzone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  targetDropzone.classList.add('dragover');
});

targetDropzone?.addEventListener('dragleave', () => {
  targetDropzone.classList.remove('dragover');
});

targetDropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  targetDropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleTargetUpload(Array.from(e.dataTransfer.files));
  }
});

targetInput?.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleTargetUpload(Array.from(e.target.files));
  }
});

function handleTargetUpload(files) {
  targetFiles = [...targetFiles, ...files];
  updateTargetPreview();
  updateCreateButton();
}

function updateTargetPreview() {
  const preview = document.getElementById('targetPreview');
  preview.innerHTML = targetFiles.map((file, index) => `
    <div class="target-thumb">
      <img src="${URL.createObjectURL(file)}" alt="Target ${index + 1}">
      <button onclick="removeTarget(${index})" class="remove-btn-small">×</button>
    </div>
  `).join('');
  
  if (targetFiles.length > 0) {
    targetDropzone.classList.add('has-files');
  } else {
    targetDropzone.classList.remove('has-files');
  }
}

function removeTarget(index) {
  targetFiles.splice(index, 1);
  updateTargetPreview();
  updateCreateButton();
}

function updateCreateButton() {
  const btn = document.getElementById('createBtn');
  if (faceRefFile && targetFiles.length > 0) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

// ============================================
// CREATE QUEUE
// ============================================

function createQueue() {
  if (!apiKey) {
    alert('PLEASE AUTHORIZE YOUR API KEY FIRST');
    return;
  }

  const variations = parseInt(document.getElementById('variationsSelect').value);
  selectedDimensions = document.getElementById('dimensionsSelect').value;
  
  queue = targetFiles.map((file, index) => ({
    id: Date.now() + index,
    targetFile: file,
    variations: variations,
    status: 'ready',
    results: [],
    progress: { current: 0, total: variations },
    selected: false
  }));

  renderQueue();
  
  document.getElementById('queueSection').style.display = 'block';
  document.getElementById('setupCard').style.display = 'none';
  
  updateQueueStats();
}

function renderQueue() {
  const container = document.getElementById('queueContainer');
  container.innerHTML = queue.map((item, index) => `
    <div class="queue-row ${item.selected ? 'selected' : ''}" id="row-${item.id}">
      <div class="row-header">
        <div class="row-info">
          <input type="checkbox" class="row-checkbox" onchange="toggleRowSelection(${index})" ${item.selected ? 'checked' : ''}>
          <span class="row-name">${item.targetFile.name}</span>
          <span class="status-badge status-${item.status}">${getStatusText(item)}</span>
        </div>
        <div class="row-actions">
          ${item.status === 'ready' ? `<button onclick="generateRow(${index})" class="glass-button small primary">GENERATE</button>` : ''}
          ${item.status === 'processing' ? `<div class="spinner"></div>` : ''}
          ${item.status === 'complete' ? `
            <button onclick="regenerateRow(${index})" class="glass-button icon" title="Regenerate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          ` : ''}
          <button onclick="removeRow(${index})" class="glass-button icon">×</button>
        </div>
      </div>
      ${item.status === 'processing' ? `
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(item.progress.current / item.progress.total * 100)}%"></div>
        </div>
      ` : ''}
      ${item.results.length > 0 ? `
        <div class="results-grid">
          ${item.results.map((result, varIndex) => result.url ? `
            <div class="result-thumb">
              <img src="${result.url}" alt="Result ${varIndex + 1}" loading="lazy">
              <div class="result-overlay">
                <button onclick="openPreview(${index}, ${varIndex})" class="icon-button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>

                <a href="${result.url}" download="result_${varIndex + 1}.jpg" class="icon-button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            </div>
          ` : '').join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

function getStatusText(item) {
  switch(item.status) {
    case 'ready': return 'READY';
    case 'processing': return `PROCESSING ${item.progress.current}/${item.progress.total}`;
    case 'complete': return 'COMPLETE';
    case 'error': return 'ERROR';
    default: return '';
  }
}

function updateQueueStats() {
  const total = queue.length;
  const ready = queue.filter(i => i.status === 'ready').length;
  const complete = queue.filter(i => i.status === 'complete').length;
  const totalVariations = queue.reduce((sum, item) => sum + item.variations, 0);
  
  document.getElementById('queueStats').textContent = 
    `(${total} INPUTS × ${queue[0]?.variations || 0} = ${totalVariations} TOTAL)`;
  
  document.getElementById('processAllBtn').style.display = ready > 0 ? 'block' : 'none';
}

function removeRow(index) {
  queue.splice(index, 1);
  renderQueue();
  updateQueueStats();
  
  if (queue.length === 0) {
    clearAllRows();
  }
}

// ============================================
// GENERATE & REGENERATE
// ============================================

async function generateRow(index) {
  const item = queue[index];
  
  if (!faceRefFile) {
    alert('FACE REFERENCE MISSING');
    return;
  }

  item.status = 'processing';
  item.progress.current = 0;
  renderQueue();
  updateQueueStats();

  for (let v = 0; v < item.variations; v++) {
    try {
      const formData = new FormData();
      formData.append('apiKey', apiKey);
      formData.append('dimensions', selectedDimensions);
      formData.append('faceRef', faceRefFile);
      formData.append('target', item.targetFile);

      const response = await fetch('/api/process-single', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`API ERROR: ${response.status}`);

      const result = await response.json();

      if (result.success) {
        item.results.push({
          url: result.outputUrl,
          index: v
        });
        item.progress.current = v + 1;
      } else {
        throw new Error(result.error || 'GENERATION FAILED');
      }

    } catch (error) {
      console.error(`ERROR ON VARIATION ${v + 1}:`, error);
      item.results.push({
        url: null,
        error: error.message
      });
      item.progress.current = v + 1;
    }

    renderQueue();
  }

  item.status = 'complete';
  renderQueue();
  updateQueueStats();
}

async function regenerateRow(index) {
  const item = queue[index];
  item.results = [];
  item.status = 'ready';
  item.progress.current = 0;
  renderQueue();
  await generateRow(index);
}

async function processAllRemaining() {
  // Get all ready rows
  const readyRows = queue
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === 'ready');
  
  if (readyRows.length === 0) {
    alert('NO ROWS READY TO PROCESS');
    return;
  }
  
  // Trigger all in parallel (don't await each one)
  readyRows.forEach(({ index }) => {
    generateRow(index);
  });
}

async function downloadAllRow(index) {
  const item = queue[index];
  console.log('Downloading all from row:', index);
  console.log('Total results:', item.results.length);
  console.log('Results array:', item.results);
  
  // Filter out null/error results
  const validResults = item.results.filter(r => r && r.url);
  console.log('Valid results to download:', validResults.length);
  
  for (let i = 0; i < validResults.length; i++) {
    const result = validResults[i];
    console.log(`Downloading ${i + 1}/${validResults.length}:`, result.url);
    
    const link = document.createElement('a');
    link.href = result.url;
    link.download = `${item.targetFile.name.replace(/\.[^/.]+$/, '')}_var${i + 1}.jpg`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 500ms delay between downloads
    if (i < validResults.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('Download complete');
}

// ============================================
// REMOVE CLOTHING (NSFW)
// ============================================
// BULK SELECTION
// ============================================

function toggleRowSelection(index) {
  queue[index].selected = !queue[index].selected;
  renderQueue();
  updateBulkActions();
}

function selectAllRows() {
  const allSelected = queue.every(item => item.selected);
  queue.forEach(item => item.selected = !allSelected);
  renderQueue();
  updateBulkActions();
  document.getElementById('selectAllBtn').textContent = allSelected ? 'SELECT ALL' : 'DESELECT ALL';
}

function updateBulkActions() {
  const selectedCount = queue.filter(item => item.selected).length;
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  if (selectedCount > 0) {
    deleteBtn.style.display = 'inline-block';
    deleteBtn.textContent = `DELETE SELECTED (${selectedCount})`;
  } else {
    deleteBtn.style.display = 'none';
  }
}

function deleteSelectedRows() {
  if (!confirm(`DELETE ${queue.filter(item => item.selected).length} SELECTED ROWS?`)) return;
  queue = queue.filter(item => !item.selected);
  renderQueue();
  updateQueueStats();
  updateBulkActions();
  
  if (queue.length === 0) {
    clearAllRows();
  }
}

function clearAllRows() {
  if (queue.length > 0 && !confirm('CLEAR ALL ROWS AND RESET?')) return;
  
  queue = [];
  targetFiles = [];
  document.getElementById('queueSection').style.display = 'none';
  document.getElementById('setupCard').style.display = 'block';
  updateTargetPreview();
}

// ============================================
// ADD MORE IMAGES
// ============================================

const addMoreDropzone = document.getElementById('addMoreDropzone');
const addMoreInput = document.getElementById('addMoreInput');

addMoreDropzone?.addEventListener('click', () => addMoreInput.click());

addMoreDropzone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  addMoreDropzone.classList.add('dragover');
});

addMoreDropzone?.addEventListener('dragleave', () => {
  addMoreDropzone.classList.remove('dragover');
});

addMoreDropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  addMoreDropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    addMoreImagesToQueue(Array.from(e.dataTransfer.files));
  }
});

addMoreInput?.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    addMoreImagesToQueue(Array.from(e.target.files));
  }
});

function addMoreImagesToQueue(files) {
  const variations = queue[0]?.variations || 3;
  
  files.forEach(file => {
    queue.push({
      id: Date.now() + Math.random(),
      targetFile: file,
      variations: variations,
      status: 'ready',
      results: [],
      progress: { current: 0, total: variations },
      selected: false
    });
  });

  renderQueue();
  updateQueueStats();
}

// ============================================
// PREVIEW MODAL
// ============================================

function openPreview(rowIndex, varIndex) {
  currentPreview = { rowIndex, varIndex };
  const item = queue[rowIndex];
  const validResults = item.results.filter(r => r && r.url);
  const result = validResults[varIndex];
  
  if (!result) return;
  
  document.getElementById('previewImage').src = result.url;
  document.getElementById('previewCounter').textContent = 
    `${varIndex + 1} / ${validResults.length}`;
  document.getElementById('previewDownload').href = result.url;
  document.getElementById('previewModal').style.display = 'flex';
}

function closePreview() {
  document.getElementById('previewModal').style.display = 'none';
}

function prevVariation() {
  const item = queue[currentPreview.rowIndex];
  const validResults = item.results.filter(r => r && r.url);
  const newIndex = (currentPreview.varIndex - 1 + validResults.length) % validResults.length;
  openPreview(currentPreview.rowIndex, newIndex);
}

function nextVariation() {
  const item = queue[currentPreview.rowIndex];
  const validResults = item.results.filter(r => r && r.url);
  const newIndex = (currentPreview.varIndex + 1) % validResults.length;
  openPreview(currentPreview.rowIndex, newIndex);
}

document.getElementById('previewModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'previewModal') closePreview();
});
