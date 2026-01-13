// PromptCanvas - Background Service Worker
// Handles message passing between content scripts and popup

const STORAGE_KEY = 'promptcanvas_templates';

// ===== Storage Functions =====
async function getAllTemplates() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function getTemplateByTrigger(trigger) {
  const templates = await getAllTemplates();
  return templates.find(t => t.trigger === trigger);
}

async function saveTemplate(template) {
  const templates = await getAllTemplates();
  const now = Date.now();
  
  const newTemplate = {
    id: template.id || generateId(),
    name: template.name,
    trigger: template.trigger,
    template: template.template,
    createdAt: template.createdAt || now,
    updatedAt: now
  };
  
  const existingIndex = templates.findIndex(t => t.id === newTemplate.id);
  if (existingIndex >= 0) {
    templates[existingIndex] = newTemplate;
  } else {
    templates.push(newTemplate);
  }
  
  await chrome.storage.local.set({ [STORAGE_KEY]: templates });
  
  // Notify content scripts of updated triggers
  notifyTriggersUpdated();
  
  return newTemplate;
}

async function deleteTemplate(id) {
  const templates = await getAllTemplates();
  const filtered = templates.filter(t => t.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  
  // Notify content scripts of updated triggers
  notifyTriggersUpdated();
}

function generateId() {
  return 'tmpl_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function notifyTriggersUpdated() {
  const templates = await getAllTemplates();
  const triggers = templates.map(t => t.trigger);
  
  // Send to all tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGERS_UPDATED', triggers });
    } catch (e) {
      // Tab might not have content script loaded
    }
  }
}

// ===== Message Handling =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep the message channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_ALL_TEMPLATES':
      return await getAllTemplates();
    
    case 'GET_TEMPLATE_BY_TRIGGER':
      return await getTemplateByTrigger(message.trigger);
    
    case 'SAVE_TEMPLATE':
      return await saveTemplate(message.template);
    
    case 'DELETE_TEMPLATE':
      await deleteTemplate(message.id);
      return { success: true };
    
    case 'GET_ALL_TRIGGERS':
      const templates = await getAllTemplates();
      return templates.map(t => t.trigger);
    
    default:
      console.warn('Unknown message type:', message.type);
      return { error: 'Unknown message type' };
  }
}

// ===== Install Event =====
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Add a sample template
    const sampleTemplate = {
      name: '흥부전 이미지 프롬프트',
      trigger: '/heungbu',
      template: {
        "_meta": {
          "name": "흥부전 이미지 프롬프트",
          "trigger": "/heungbu",
          "outputFormat": "json"
        },
        "style": {
          "art_style": "Korean watercolor illustration, ink wash painting",
          "mood": "$select:warm and whimsical folk tale|dark and dramatic|peaceful and serene",
          "texture": "rough hanji paper texture"
        },
        "quality": {
          "resolution": "4K",
          "rendering": "high-detail illustration"
        },
        "character": "$array:characterItem",
        "$schemas": {
          "characterItem": {
            "name": "$input:캐릭터 이름",
            "appearance": "$input:외모 설명",
            "placement": "$select:center|left side|right side|foreground|background",
            "doing_what": "$input:행동"
          }
        },
        "object": "$array:objectItem",
        "$schemas.objectItem": "$input:오브젝트 설명",
        "background": "$select:thatched house yard in a snowy winter village|inside a small humble room|sunny farm field",
        "composition": {
          "framing": "$select:medium shot|wide shot|close-up",
          "angle": "$select:eye-level|low-angle|high-angle|cinematic side view"
        }
      }
    };
    
    await saveTemplate(sampleTemplate);
    console.log('PromptCanvas: Sample template installed');
  }
});
