// PromptCanvas Popup Script
// Manages template CRUD operations

let templates = [];
let currentEditId = null;

// DOM Elements
const views = {
  list: document.getElementById('templateListView'),
  edit: document.getElementById('templateEditView'),
  help: document.getElementById('helpView')
};

const elements = {
  templateList: document.getElementById('templateList'),
  searchInput: document.getElementById('searchInput'),
  newTemplateBtn: document.getElementById('newTemplateBtn'),
  backBtn: document.getElementById('backBtn'),
  editorTitle: document.getElementById('editorTitle'),
  templateForm: document.getElementById('templateForm'),
  templateName: document.getElementById('templateName'),
  templateTrigger: document.getElementById('templateTrigger'),
  templateJson: document.getElementById('templateJson'),
  jsonStatus: document.getElementById('jsonStatus'),
  cancelBtn: document.getElementById('cancelBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
  helpBtn: document.getElementById('helpBtn'),
  helpBackBtn: document.getElementById('helpBackBtn')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadTemplates();
  renderTemplateList();
  setupEventListeners();
}

async function loadTemplates() {
  try {
    templates = await chrome.runtime.sendMessage({ type: 'GET_ALL_TEMPLATES' });
  } catch (e) {
    console.error('Failed to load templates:', e);
    templates = [];
  }
}

function renderTemplateList(filter = '') {
  const filtered = templates.filter(t => 
    t.name.toLowerCase().includes(filter.toLowerCase()) ||
    t.trigger.toLowerCase().includes(filter.toLowerCase())
  );
  
  if (filtered.length === 0) {
    elements.templateList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">
          ${filter ? '검색 결과가 없습니다' : '템플릿이 없습니다.<br>새 템플릿을 만들어보세요!'}
        </div>
      </div>
    `;
    return;
  }
  
  elements.templateList.innerHTML = filtered.map(t => `
    <div class="template-item" data-id="${t.id}">
      <div class="template-info">
        <div class="template-name">${escapeHtml(t.name)}</div>
        <div class="template-trigger">${escapeHtml(t.trigger)}</div>
      </div>
      <div class="template-actions">
        <button class="btn-icon" data-action="edit" data-id="${t.id}" title="편집">✏️</button>
      </div>
    </div>
  `).join('');
}

function setupEventListeners() {
  // Search
  elements.searchInput.addEventListener('input', (e) => {
    renderTemplateList(e.target.value);
  });
  
  // New template
  elements.newTemplateBtn.addEventListener('click', () => {
    openEditor(null);
  });
  
  // Template list clicks
  elements.templateList.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-action="edit"]');
    const templateItem = e.target.closest('.template-item');
    
    if (editBtn) {
      openEditor(editBtn.dataset.id);
    } else if (templateItem) {
      openEditor(templateItem.dataset.id);
    }
  });
  
  // Back button
  elements.backBtn.addEventListener('click', () => {
    showView('list');
  });
  
  // Cancel button
  elements.cancelBtn.addEventListener('click', () => {
    showView('list');
  });
  
  // Delete button
  elements.deleteBtn.addEventListener('click', async () => {
    if (currentEditId && confirm('이 템플릿을 삭제하시겠습니까?')) {
      await deleteTemplate(currentEditId);
      showView('list');
    }
  });
  
  // Form submit
  elements.templateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCurrentTemplate();
  });
  
  // JSON validation on input
  elements.templateJson.addEventListener('input', validateJson);
  
  // Help
  elements.helpBtn.addEventListener('click', () => {
    showView('help');
  });
  
  elements.helpBackBtn.addEventListener('click', () => {
    showView('edit');
  });
}

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

function openEditor(templateId) {
  currentEditId = templateId;
  
  if (templateId) {
    // Edit existing
    const template = templates.find(t => t.id === templateId);
    if (template) {
      elements.editorTitle.textContent = '템플릿 편집';
      elements.templateName.value = template.name;
      elements.templateTrigger.value = template.trigger;
      elements.templateJson.value = JSON.stringify(template.template, null, 2);
      elements.deleteBtn.style.display = 'block';
    }
  } else {
    // New template
    elements.editorTitle.textContent = '새 템플릿';
    elements.templateName.value = '';
    elements.templateTrigger.value = '';
    elements.templateJson.value = '';
    elements.deleteBtn.style.display = 'none';
  }
  
  elements.jsonStatus.textContent = '';
  showView('edit');
}

function validateJson() {
  const value = elements.templateJson.value.trim();
  
  if (!value) {
    elements.jsonStatus.textContent = '';
    elements.jsonStatus.className = 'hint json-status';
    return false;
  }
  
  try {
    JSON.parse(value);
    elements.jsonStatus.textContent = '✓ 유효한 JSON';
    elements.jsonStatus.className = 'hint json-status valid';
    return true;
  } catch (e) {
    elements.jsonStatus.textContent = `✗ JSON 오류: ${e.message}`;
    elements.jsonStatus.className = 'hint json-status invalid';
    return false;
  }
}

async function saveCurrentTemplate() {
  const name = elements.templateName.value.trim();
  const trigger = elements.templateTrigger.value.trim();
  const jsonStr = elements.templateJson.value.trim();
  
  // Validation
  if (!name) {
    alert('템플릿 이름을 입력하세요.');
    elements.templateName.focus();
    return;
  }
  
  if (!trigger) {
    alert('트리거 키워드를 입력하세요.');
    elements.templateTrigger.focus();
    return;
  }
  
  if (!trigger.startsWith('/')) {
    alert('트리거 키워드는 /로 시작해야 합니다.');
    elements.templateTrigger.focus();
    return;
  }
  
  if (!jsonStr) {
    alert('템플릿 JSON을 입력하세요.');
    elements.templateJson.focus();
    return;
  }
  
  let templateObj;
  try {
    templateObj = JSON.parse(jsonStr);
  } catch (e) {
    alert('유효한 JSON 형식이 아닙니다.');
    elements.templateJson.focus();
    return;
  }
  
  // Check for duplicate trigger (except current template)
  const existingTrigger = templates.find(t => t.trigger === trigger && t.id !== currentEditId);
  if (existingTrigger) {
    alert(`트리거 "${trigger}"는 이미 다른 템플릿에서 사용 중입니다.`);
    elements.templateTrigger.focus();
    return;
  }
  
  // Add meta to template
  templateObj._meta = {
    name,
    trigger,
    outputFormat: 'json'
  };
  
  const templateData = {
    id: currentEditId,
    name,
    trigger,
    template: templateObj
  };
  
  try {
    await chrome.runtime.sendMessage({ type: 'SAVE_TEMPLATE', template: templateData });
    await loadTemplates();
    renderTemplateList();
    showView('list');
  } catch (e) {
    console.error('Failed to save template:', e);
    alert('템플릿 저장에 실패했습니다.');
  }
}

async function deleteTemplate(id) {
  try {
    await chrome.runtime.sendMessage({ type: 'DELETE_TEMPLATE', id });
    await loadTemplates();
    renderTemplateList();
  } catch (e) {
    console.error('Failed to delete template:', e);
    alert('템플릿 삭제에 실패했습니다.');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
