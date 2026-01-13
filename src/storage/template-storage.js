// PromptCanvas - Template Storage Module
// Handles CRUD operations for templates using Chrome Storage API

const STORAGE_KEY = "promptcanvas_templates";

/**
 * Template structure:
 * {
 *   id: string,
 *   name: string,
 *   trigger: string,
 *   template: object,
 *   createdAt: number,
 *   updatedAt: number
 * }
 */

// Get all templates
export async function getAllTemplates() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
}

// Get template by trigger keyword
export async function getTemplateByTrigger(trigger) {
    const templates = await getAllTemplates();
    return templates.find((t) => t.trigger === trigger);
}

// Get template by ID
export async function getTemplateById(id) {
    const templates = await getAllTemplates();
    return templates.find((t) => t.id === id);
}

// Save a new template
export async function saveTemplate(template) {
    const templates = await getAllTemplates();
    const now = Date.now();

    const newTemplate = {
        id: template.id || generateId(),
        name: template.name,
        trigger: template.trigger,
        template: template.template,
        createdAt: template.createdAt || now,
        updatedAt: now,
    };

    // Check for duplicate trigger
    const existingIndex = templates.findIndex((t) => t.id === newTemplate.id);
    if (existingIndex >= 0) {
        templates[existingIndex] = newTemplate;
    } else {
        templates.push(newTemplate);
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: templates });
    return newTemplate;
}

// Delete a template
export async function deleteTemplate(id) {
    const templates = await getAllTemplates();
    const filtered = templates.filter((t) => t.id !== id);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

// Generate unique ID
function generateId() {
    return (
        "tmpl_" +
        Date.now().toString(36) +
        Math.random().toString(36).substr(2, 9)
    );
}

// Get all trigger keywords for quick lookup
export async function getAllTriggers() {
    const templates = await getAllTemplates();
    return templates.map((t) => t.trigger);
}

// Export templates as JSON
export async function exportTemplates() {
    const templates = await getAllTemplates();
    return JSON.stringify(templates, null, 2);
}

// Import templates from JSON
export async function importTemplates(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        if (!Array.isArray(imported)) throw new Error("Invalid format");

        const existingTemplates = await getAllTemplates();
        const merged = [...existingTemplates];

        for (const template of imported) {
            const existingIndex = merged.findIndex((t) => t.id === template.id);
            if (existingIndex >= 0) {
                merged[existingIndex] = template;
            } else {
                merged.push(template);
            }
        }

        await chrome.storage.local.set({ [STORAGE_KEY]: merged });
        return merged.length;
    } catch (e) {
        throw new Error("Failed to import templates: " + e.message);
    }
}
