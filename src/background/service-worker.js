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
  const found = templates.find(t => t.trigger === trigger);
  if (found && found.templateJson) {
    // Parse JSON string to object when retrieving
    const parsed = JSON.parse(found.templateJson);
    // Add _meta dynamically
    parsed._meta = {
      name: found.name,
      trigger: found.trigger,
      outputFormat: 'json'
    };
    return {
      ...found,
      template: parsed
    };
  }
  return found;
}

async function saveTemplate(template) {
  const templates = await getAllTemplates();
  const now = Date.now();

  const newTemplate = {
    id: template.id || generateId(),
    name: template.name,
    trigger: template.trigger,
    // Store as JSON string to preserve key order
    templateJson: typeof template.template === 'string' 
      ? template.template 
      : JSON.stringify(template.template),
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
    // Add default templates

    // Scene template (/s) - 장면
    const sceneTemplate = {
      name: '장면',
      trigger: '/s',
      template: {
        "$schemas": {
          "characterItem": {
            "appearance": "$input",
            "expression": "$input",
            "action": "$input",
            "placement": "$select:center|left side|right side|foreground|background"
          }
        },
        "_meta": {
          "name": "장면",
          "outputFormat": "json",
          "trigger": "/s"
        },
        "background": "$input",
        "character": "$array:characterItem",
        "composition": {
          "angle": "$select:eye-level|low-angle|high-angle|cinematic side view",
          "framing": "$select:medium shot|wide shot|close-up"
        },
        "time_of_day": "$select:dawn|day|dusk|night",
        "lighting": "$select:soft natural light|golden hour|dramatic shadows|flat lighting",
        "object": "$array:objectItem",
        "quality": {
          "rendering": "high-detail illustration",
          "resolution": "4K"
        },
        "style": {
          "art_style": "Korean watercolor illustration, ink wash painting",
          "mood": "$select:warm and whimsical folk tale|dark and dramatic|peaceful and serene",
          "texture": "rough hanji paper texture"
        }
      }
    };

    // Reference sheet template (/r) - 레퍼런스 삼면도
    const referenceTemplate = {
      name: '레퍼런스 삼면도',
      trigger: '/r',
      template: {
        "_meta": {
          "name": "레퍼런스 삼면도",
          "outputFormat": "json",
          "trigger": "/r"
        },
        "subject": "$input",
        "background": "plain white background",
        "composition": {
          "type": "character reference sheet, three-view orthographic",
          "views": "front view, side view, back view",
          "framing": "full shot, full body visible",
          "layout": "three views arranged horizontally"
        },
        "quality": {
          "rendering": "high-detail illustration",
          "resolution": "4K"
        },
        "style": {
          "art_style": "Korean watercolor illustration, ink wash painting",
          "mood": "$select:warm and whimsical folk tale|dark and dramatic|peaceful and serene",
          "texture": "rough hanji paper texture"
        },
        "constraints": {
          "text": "no text, no labels, no annotations",
          "consistency": "consistent design across all three views"
        }
      }
    };

    await saveTemplate(sceneTemplate);
    await saveTemplate(referenceTemplate);
    console.log('PromptCanvas: Default templates installed');
  }
});
