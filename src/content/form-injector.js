// PromptCanvas - Form Injector
// Injects the modal form UI into web pages

import { renderForm, renderArrayItem, collectFormValues, generateOutput, parseMarker } from './form-renderer.js';

let currentOverlay = null;
let currentTemplate = null;
let currentTargetElement = null;
let currentTriggerText = '';

/**
 * Show the form modal for a template
 */
export function showFormModal(template, targetElement, triggerText) {
  // Remove any existing modal
  hideFormModal();
  
  currentTemplate = template;
  currentTargetElement = targetElement;
  currentTriggerText = triggerText;
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'promptcanvas-overlay';
  overlay.innerHTML = createModalHTML(template);
  
  document.body.appendChild(overlay);
  currentOverlay = overlay;
  
  // Trigger animation
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });
  
  // Setup event listeners
  setupEventListeners(overlay, template);
  
  // Focus first input
  const firstInput = overlay.querySelector('.promptcanvas-input, .promptcanvas-select');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }
}

/**
 * Hide the form modal
 */
export function hideFormModal() {
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

/**
 * Create the modal HTML structure
 */
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

/**
 * Setup event listeners for the modal
 */
function setupEventListeners(overlay, template) {
  const schemas = template.$schemas || {};
  
  // Also get dot notation schemas
  for (const [key, value] of Object.entries(template)) {
    if (key.startsWith('$schemas.')) {
      const schemaName = key.replace('$schemas.', '');
      schemas[schemaName] = value;
    }
  }
  
  // Close button and backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.dataset.action === 'close') {
      hideFormModal();
    }
  });
  
  // Action buttons
  overlay.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    
    if (action === 'insert') {
      insertGeneratedOutput();
    } else if (action === 'preview') {
      togglePreview(overlay, template);
    }
  });
  
  // Add array item buttons
  overlay.addEventListener('click', (e) => {
    const addTo = e.target.dataset.addTo || e.target.closest('[data-add-to]')?.dataset.addTo;
    if (addTo) {
      addArrayItem(overlay, addTo, schemas);
    }
  });
  
  // Delete array item buttons
  overlay.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-from]');
    if (deleteBtn) {
      deleteArrayItem(overlay, deleteBtn.dataset.deleteFrom, parseInt(deleteBtn.dataset.index, 10));
    }
  });
  
  // Keyboard shortcuts
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideFormModal();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      insertGeneratedOutput();
    }
  });
}

/**
 * Add a new array item
 */
function addArrayItem(overlay, arrayPath, schemas) {
  const container = overlay.querySelector(`[data-array="${arrayPath}"]`);
  if (!container) return;
  
  const schemaName = container.dataset.schema;
  const schema = schemas[schemaName];
  
  // Count existing items
  const existingItems = container.querySelectorAll(`[data-array-item="${arrayPath}"]`);
  const newIndex = existingItems.length;
  
  // Get the key from the path (last part before any brackets)
  const key = arrayPath.split('.').pop().replace(/\[\d+\]$/, '');
  
  // Create new item HTML
  const itemHtml = renderArrayItem(key, newIndex, schema, schemas, {}, arrayPath);
  
  // Insert before the add button
  const addBtn = container.querySelector(`[data-add-to="${arrayPath}"]`);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = itemHtml;
  const newItem = tempDiv.firstElementChild;
  
  container.insertBefore(newItem, addBtn);
  
  // Focus first input in new item
  const firstInput = newItem.querySelector('.promptcanvas-input, .promptcanvas-select');
  if (firstInput) {
    firstInput.focus();
  }
}

/**
 * Delete an array item
 */
function deleteArrayItem(overlay, arrayPath, index) {
  const container = overlay.querySelector(`[data-array="${arrayPath}"]`);
  if (!container) return;
  
  const items = container.querySelectorAll(`[data-array-item="${arrayPath}"]`);
  
  // Don't allow deleting the last item
  if (items.length <= 1) {
    return;
  }
  
  // Find and remove the item
  const itemToRemove = container.querySelector(`[data-array-item="${arrayPath}"][data-index="${index}"]`);
  if (itemToRemove) {
    itemToRemove.remove();
    
    // Re-index remaining items
    const remainingItems = container.querySelectorAll(`[data-array-item="${arrayPath}"]`);
    remainingItems.forEach((item, newIndex) => {
      item.dataset.index = newIndex;
      const title = item.querySelector('.promptcanvas-array-item-title');
      if (title) {
        title.textContent = `#${newIndex + 1}`;
      }
      const deleteBtn = item.querySelector('[data-delete-from]');
      if (deleteBtn) {
        deleteBtn.dataset.index = newIndex;
      }
      
      // Update field paths
      item.querySelectorAll('[data-path]').forEach(field => {
        field.dataset.path = field.dataset.path.replace(/\[\d+\]/, `[${newIndex}]`);
      });
    });
  }
}

/**
 * Toggle preview panel
 */
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

/**
 * Insert the generated output into the target element
 */
function insertGeneratedOutput() {
  if (!currentTemplate || !currentTargetElement) return;
  
  const values = collectFormValues(currentOverlay);
  const output = generateOutput(currentTemplate, values);
  const jsonString = JSON.stringify(output, null, 2);
  
  // Get current value and find trigger position
  const currentValue = currentTargetElement.value || '';
  const triggerIndex = currentValue.lastIndexOf(currentTriggerText);
  
  if (triggerIndex >= 0) {
    // Replace trigger with output
    const before = currentValue.substring(0, triggerIndex);
    const after = currentValue.substring(triggerIndex + currentTriggerText.length);
    currentTargetElement.value = before + jsonString + after;
  } else {
    // Just append
    currentTargetElement.value = currentValue + jsonString;
  }
  
  // Trigger input event for frameworks that listen to it
  currentTargetElement.dispatchEvent(new Event('input', { bubbles: true }));
  currentTargetElement.dispatchEvent(new Event('change', { bubbles: true }));
  
  hideFormModal();
  currentTargetElement.focus();
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
