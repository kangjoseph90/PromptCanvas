// PromptCanvas - Content Script (Bundled)
// Detects trigger keywords and shows modal form UI

(function() {
  'use strict';

  // ===== Storage Functions =====
  async function getAllTriggers() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_TRIGGERS' });
      return response || [];
    } catch (e) {
      console.warn('PromptCanvas: Failed to get triggers', e);
      return [];
    }
  }

  async function getTemplateByTrigger(trigger) {
    try {
      return await chrome.runtime.sendMessage({ type: 'GET_TEMPLATE_BY_TRIGGER', trigger });
    } catch (e) {
      console.warn('PromptCanvas: Failed to get template', e);
      return null;
    }
  }

  // ===== Form Renderer =====
  function parseMarker(value) {
    if (typeof value !== 'string') {
      return { type: 'static', value };
    }
    
    const inputMatch = value.match(/^\$input:(.+)$/);
    if (inputMatch) {
      return { type: 'input', label: inputMatch[1] };
    }
    
    const selectMatch = value.match(/^\$select:(.+)$/);
    if (selectMatch) {
      const options = selectMatch[1].split('|').map(o => o.trim());
      return { type: 'select', label: options[0], options };
    }
    
    const arrayMatch = value.match(/^\$array:(.+)$/);
    if (arrayMatch) {
      return { type: 'array', schemaName: arrayMatch[1] };
    }
    
    return { type: 'static', value };
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderField(key, marker, defaultValue = '', path = '') {
    const fieldId = `pc-field-${path}${key}`.replace(/[.\[\]]/g, '-');
    
    switch (marker.type) {
      case 'input':
        return `
          <div class="promptcanvas-field">
            <label class="promptcanvas-label" for="${fieldId}">${escapeHtml(marker.label)}</label>
            <input type="text" 
                   class="promptcanvas-input" 
                   id="${fieldId}" 
                   data-path="${path}${key}"
                   value="${escapeHtml(defaultValue)}"
                   placeholder="${escapeHtml(marker.label)}">
          </div>
        `;
      
      case 'select':
        const datalistId = `${fieldId}-list`;
        const optionsHtml = marker.options.map(opt => 
          `<option value="${escapeHtml(opt)}">`
        ).join('');
        return `
          <div class="promptcanvas-field">
            <label class="promptcanvas-label" for="${fieldId}">${escapeHtml(key)}</label>
            <input type="text" 
                   class="promptcanvas-input promptcanvas-select" 
                   id="${fieldId}" 
                   list="${datalistId}"
                   data-path="${path}${key}"
                   value="${escapeHtml(defaultValue)}"
                   placeholder="선택 또는 직접 입력...">
            <datalist id="${datalistId}">
              ${optionsHtml}
            </datalist>
          </div>
        `;
      
      case 'static':
        return `
          <div class="promptcanvas-field">
            <label class="promptcanvas-label">${escapeHtml(key)}</label>
            <div class="promptcanvas-static" data-path="${path}${key}" data-static="true">${escapeHtml(marker.value)}</div>
          </div>
        `;
      
      default:
        return '';
    }
  }

  function renderArrayItem(key, index, schema, schemas, values = {}, arrayPath = '') {
    const itemPath = `${arrayPath}[${index}].`;
    let fieldsHtml = '';
    
    if (typeof schema === 'string') {
      const marker = parseMarker(schema);
      const fieldValue = typeof values === 'string' ? values : '';
      fieldsHtml = renderField('value', marker, fieldValue, itemPath);
    } else if (schema) {
      for (const [fieldKey, fieldValue] of Object.entries(schema)) {
        const marker = parseMarker(fieldValue);
        fieldsHtml += renderField(fieldKey, marker, values[fieldKey] || '', itemPath);
      }
    }
    
    return `
      <div class="promptcanvas-array-item" data-array-item="${arrayPath}" data-index="${index}">
        <div class="promptcanvas-array-item-header">
          <span class="promptcanvas-array-item-title">#${index + 1}</span>
          <button type="button" class="promptcanvas-array-item-delete" data-delete-from="${arrayPath}" data-index="${index}">
            삭제
          </button>
        </div>
        ${fieldsHtml}
      </div>
    `;
  }

  function renderArrayField(key, schemaName, schemas, items = [], path = '') {
    const arrayPath = `${path}${key}`;
    const schema = schemas[schemaName] || schemas[`$schemas.${schemaName}`];
    
    let itemsHtml = '';
    items.forEach((item, index) => {
      itemsHtml += renderArrayItem(key, index, schema, schemas, item, arrayPath);
    });
    
    return `
      <div class="promptcanvas-section">
        <div class="promptcanvas-section-header">
          <span class="promptcanvas-section-title">${escapeHtml(key)}</span>
        </div>
        <div class="promptcanvas-array-container" data-array="${arrayPath}" data-schema="${schemaName}">
          ${itemsHtml}
          <button type="button" class="promptcanvas-add-btn" data-add-to="${arrayPath}">
            <span>+</span> ${escapeHtml(key)} 추가
          </button>
        </div>
      </div>
    `;
  }

  function renderNestedObject(key, obj, schemas, values = {}, path = '') {
    const nestedPath = `${path}${key}.`;
    let fieldsHtml = '';
    
    for (const [fieldKey, fieldValue] of Object.entries(obj)) {
      if (fieldKey.startsWith('$') || fieldKey === '_meta') continue;
      
      if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
        fieldsHtml += renderNestedObject(fieldKey, fieldValue, schemas, values[fieldKey] || {}, nestedPath);
      } else {
        const marker = parseMarker(fieldValue);
        if (marker.type === 'array') {
          fieldsHtml += renderArrayField(fieldKey, marker.schemaName, schemas, values[fieldKey] || [], nestedPath);
        } else {
          fieldsHtml += renderField(fieldKey, marker, values[fieldKey] || '', nestedPath);
        }
      }
    }
    
    return `
      <div class="promptcanvas-section">
        <div class="promptcanvas-section-header">
          <span class="promptcanvas-section-title">${escapeHtml(key)}</span>
        </div>
        <div class="promptcanvas-nested">
          ${fieldsHtml}
        </div>
      </div>
    `;
  }

  function renderForm(template, values = {}) {
    let html = '';
    const schemas = template.$schemas || {};
    
    for (const [key, value] of Object.entries(template)) {
      if (key.startsWith('$schemas.')) {
        schemas[key.replace('$schemas.', '')] = value;
      }
    }
    
    for (const [key, value] of Object.entries(template)) {
      if (key === '_meta' || key === '$schemas' || key.startsWith('$schemas.')) continue;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        html += renderNestedObject(key, value, schemas, values[key] || {}, '');
      } else {
        const marker = parseMarker(value);
        if (marker.type === 'array') {
          html += renderArrayField(key, marker.schemaName, schemas, values[key] || [], '');
        } else {
          html += `<div class="promptcanvas-section">${renderField(key, marker, values[key] || '', '')}</div>`;
        }
      }
    }
    
    return html;
  }

  function setNestedValue(obj, path, value) {
    const regex = /([^.\[\]]+)|\[(\d+)\]/g;
    const parts = [];
    let match;
    
    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) parts.push(match[1]);
      else if (match[2] !== undefined) parts.push(parseInt(match[2], 10));
    }
    
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      if (current[part] === undefined) {
        current[part] = typeof nextPart === 'number' ? [] : {};
      }
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  }

  function collectFormValues(container) {
    const result = {};
    
    container.querySelectorAll('.promptcanvas-input, .promptcanvas-select, .promptcanvas-textarea').forEach(el => {
      const path = el.dataset.path;
      if (path) setNestedValue(result, path, el.value);
    });
    
    container.querySelectorAll('[data-static="true"]').forEach(el => {
      const path = el.dataset.path;
      if (path) setNestedValue(result, path, el.textContent);
    });
    
    return result;
  }

  function generateOutputObject(obj, values, schemas) {
    const output = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$')) continue;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        output[key] = generateOutputObject(value, values[key] || {}, schemas);
      } else {
        const marker = parseMarker(value);
        if (marker.type === 'array') {
          output[key] = transformArrayOutput(marker.schemaName, values[key] || [], schemas);
        } else if (marker.type === 'static') {
          output[key] = marker.value;
        } else {
          output[key] = values[key] || '';
        }
      }
    }
    
    return output;
  }

  function generateOutput(template, values) {
    const output = {};
    const schemas = template.$schemas || {};
    
    for (const [key, value] of Object.entries(template)) {
      if (key.startsWith('$schemas.')) {
        schemas[key.replace('$schemas.', '')] = value;
      }
    }
    
    for (const [key, value] of Object.entries(template)) {
      if (key === '_meta' || key === '$schemas' || key.startsWith('$schemas.')) continue;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        output[key] = generateOutputObject(value, values[key] || {}, schemas);
      } else {
        const marker = parseMarker(value);
        if (marker.type === 'array') {
          output[key] = transformArrayOutput(marker.schemaName, values[key] || [], schemas);
        } else if (marker.type === 'static') {
          output[key] = marker.value;
        } else {
          output[key] = values[key] || '';
        }
      }
    }
    
    return output;
  }

  function transformArrayOutput(schemaName, items, schemas) {
    const schema = schemas[schemaName];
    
    if (!schema || !Array.isArray(items)) {
      return items;
    }
    
    if (typeof schema === 'string') {
      return items.map(item => {
        if (typeof item === 'object' && item !== null && 'value' in item) {
          return item.value;
        }
        return item;
      });
    }
    
    return items;
  }

  // ===== Modal Management =====
  let currentOverlay = null;
  let currentTemplate = null;
  let currentTargetElement = null;
  let currentTriggerText = '';

  function showFormModal(template, targetElement, triggerText) {
    hideFormModal();
    
    currentTemplate = template;
    currentTargetElement = targetElement;
    currentTriggerText = triggerText;
    
    const overlay = document.createElement('div');
    overlay.className = 'promptcanvas-overlay';
    overlay.innerHTML = createModalHTML(template);
    
    document.body.appendChild(overlay);
    currentOverlay = overlay;
    
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
    
    setupModalEventListeners(overlay, template);
    
    const firstInput = overlay.querySelector('.promptcanvas-input, .promptcanvas-select');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }

  function hideFormModal() {
    if (currentOverlay) {
      currentOverlay.classList.remove('visible');
      setTimeout(() => {
        if (currentOverlay && currentOverlay.parentNode) {
          currentOverlay.parentNode.removeChild(currentOverlay);
        }
        currentOverlay = null;
        currentTemplate = null;
      }, 150);
    }
  }

  function createModalHTML(template) {
    const meta = template._meta || {};
    const title = meta.name || 'PromptCanvas';
    const formHtml = renderForm(template, {});
    
    return `
      <div class="promptcanvas-modal">
        <div class="promptcanvas-header">
          <h2 class="promptcanvas-title">${escapeHtml(title)}</h2>
          <button type="button" class="promptcanvas-close" data-action="close">✕</button>
        </div>
        <div class="promptcanvas-body">
          <form class="promptcanvas-form">
            ${formHtml}
          </form>
          <div class="promptcanvas-preview" style="display: none;"></div>
        </div>
        <div class="promptcanvas-footer">
          <button type="button" class="promptcanvas-btn promptcanvas-btn-preview" data-action="preview">미리보기</button>
          <button type="button" class="promptcanvas-btn promptcanvas-btn-secondary" data-action="close">취소</button>
          <button type="button" class="promptcanvas-btn promptcanvas-btn-primary" data-action="insert">삽입</button>
        </div>
      </div>
    `;
  }

  function setupModalEventListeners(overlay, template) {
    const schemas = template.$schemas || {};
    
    for (const [key, value] of Object.entries(template)) {
      if (key.startsWith('$schemas.')) {
        schemas[key.replace('$schemas.', '')] = value;
      }
    }
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.dataset.action === 'close') {
        hideFormModal();
      }
    });
    
    overlay.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'insert') insertGeneratedOutput();
      else if (action === 'preview') togglePreview(overlay, template);
    });
    
    overlay.addEventListener('click', (e) => {
      const addTo = e.target.dataset.addTo || e.target.closest('[data-add-to]')?.dataset.addTo;
      if (addTo) addArrayItem(overlay, addTo, schemas);
    });
    
    overlay.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('[data-delete-from]');
      if (deleteBtn) deleteArrayItem(overlay, deleteBtn.dataset.deleteFrom, parseInt(deleteBtn.dataset.index, 10));
    });
    
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideFormModal();
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) insertGeneratedOutput();
    });
  }

  function addArrayItem(overlay, arrayPath, schemas) {
    const container = overlay.querySelector(`[data-array="${arrayPath}"]`);
    if (!container) return;
    
    const schemaName = container.dataset.schema;
    const schema = schemas[schemaName];
    const existingItems = container.querySelectorAll(`[data-array-item="${arrayPath}"]`);
    const newIndex = existingItems.length;
    const key = arrayPath.split('.').pop().replace(/\[\d+\]$/, '');
    
    const itemHtml = renderArrayItem(key, newIndex, schema, schemas, {}, arrayPath);
    const addBtn = container.querySelector(`[data-add-to="${arrayPath}"]`);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = itemHtml;
    const newItem = tempDiv.firstElementChild;
    
    container.insertBefore(newItem, addBtn);
    
    const firstInput = newItem.querySelector('.promptcanvas-input, .promptcanvas-select');
    if (firstInput) firstInput.focus();
  }

  function deleteArrayItem(overlay, arrayPath, index) {
    const container = overlay.querySelector(`[data-array="${arrayPath}"]`);
    if (!container) return;
    
    const itemToRemove = container.querySelector(`[data-array-item="${arrayPath}"][data-index="${index}"]`);
    if (itemToRemove) {
      itemToRemove.remove();
      
      const remainingItems = container.querySelectorAll(`[data-array-item="${arrayPath}"]`);
      remainingItems.forEach((item, newIndex) => {
        item.dataset.index = newIndex;
        const title = item.querySelector('.promptcanvas-array-item-title');
        if (title) title.textContent = `#${newIndex + 1}`;
        const deleteBtn = item.querySelector('[data-delete-from]');
        if (deleteBtn) deleteBtn.dataset.index = newIndex;
        item.querySelectorAll('[data-path]').forEach(field => {
          field.dataset.path = field.dataset.path.replace(/\[\d+\]/, `[${newIndex}]`);
        });
      });
    }
  }

  function togglePreview(overlay, template) {
    const previewPanel = overlay.querySelector('.promptcanvas-preview');
    const previewBtn = overlay.querySelector('[data-action="preview"]');
    
    if (previewPanel.style.display === 'none') {
      const values = collectFormValues(overlay);
      const output = generateOutput(template, values);
      previewPanel.textContent = JSON.stringify(output, null, 2);
      previewPanel.style.display = 'block';
      previewBtn.textContent = '미리보기 닫기';
    } else {
      previewPanel.style.display = 'none';
      previewBtn.textContent = '미리보기';
    }
  }

  function insertGeneratedOutput() {
    if (!currentTemplate || !currentTargetElement) return;
    
    const values = collectFormValues(currentOverlay);
    const output = generateOutput(currentTemplate, values);
    const jsonString = JSON.stringify(output, null, 2);
    
    if (currentTargetElement.isContentEditable) {
      const currentValue = currentTargetElement.textContent || '';
      const triggerIndex = currentValue.lastIndexOf(currentTriggerText);
      
      if (triggerIndex >= 0) {
        const before = currentValue.substring(0, triggerIndex);
        const after = currentValue.substring(triggerIndex + currentTriggerText.length);
        currentTargetElement.textContent = before + jsonString + after;
      } else {
        currentTargetElement.textContent = currentValue + jsonString;
      }
    } else {
      const currentValue = currentTargetElement.value || '';
      const triggerIndex = currentValue.lastIndexOf(currentTriggerText);
      
      if (triggerIndex >= 0) {
        const before = currentValue.substring(0, triggerIndex);
        const after = currentValue.substring(triggerIndex + currentTriggerText.length);
        currentTargetElement.value = before + jsonString + after;
      } else {
        currentTargetElement.value = currentValue + jsonString;
      }
    }
    
    currentTargetElement.dispatchEvent(new Event('input', { bubbles: true }));
    currentTargetElement.dispatchEvent(new Event('change', { bubbles: true }));
    
    hideFormModal();
    currentTargetElement.focus();
  }

  // ===== Trigger Detection =====
  let triggers = [];

  async function init() {
    triggers = await getAllTriggers();
    
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TRIGGERS_UPDATED') {
        triggers = message.triggers || [];
      }
    });
    
    document.addEventListener('keydown', handleKeydown, true);
  }

  function handleKeydown(e) {
    if (e.key === ' ' || e.key === 'Tab') {
      const target = e.target;
      
      if (isTextInput(target)) {
        const triggerInfo = detectTrigger(target);
        
        if (triggerInfo) {
          e.preventDefault();
          activateTrigger(triggerInfo.trigger, target, triggerInfo.fullMatch);
        }
      }
    }
  }

  function detectTrigger(element) {
    const value = getInputValue(element);
    if (!value) return null;
    
    const cursorPos = getCursorPosition(element);
    const textBeforeCursor = value.substring(0, cursorPos);
    
    for (const trigger of triggers) {
      if (textBeforeCursor.endsWith(trigger)) {
        return { trigger, fullMatch: trigger, position: cursorPos - trigger.length };
      }
    }
    
    return null;
  }

  async function activateTrigger(trigger, element, fullMatch) {
    const template = await getTemplateByTrigger(trigger);
    if (template && template.template) {
      showFormModal(template.template, element, fullMatch);
    }
  }

  function isTextInput(element) {
    if (!element) return false;
    
    const tagName = element.tagName?.toLowerCase();
    
    if (tagName === 'textarea') return true;
    if (tagName === 'input') {
      const type = element.type?.toLowerCase();
      return ['text', 'search', 'url', 'email', ''].includes(type);
    }
    
    if (element.isContentEditable) return true;
    
    if (element.classList) {
      const editorClasses = ['ProseMirror', 'ql-editor', 'ce-paragraph', 'notranslate'];
      if (editorClasses.some(cls => element.classList.contains(cls))) return true;
    }
    
    return false;
  }

  function getInputValue(element) {
    if (element.isContentEditable) return element.textContent || '';
    return element.value || '';
  }

  function getCursorPosition(element) {
    if (element.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
      }
      return 0;
    }
    return element.selectionEnd || 0;
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
