// PromptCanvas - Content Script Entry Point
// This file imports modular components and initializes the extension

import { showFormModal, hideFormModal } from './form-injector.js';

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
