// PromptCanvas - Form Renderer
// Dynamically renders form fields based on template schema

/**
 * Parse a marker string like "$input:Label" or "$select:opt1|opt2|opt3"
 * Returns: { type: 'input'|'select'|'array'|'static', label: string, options?: string[], schema?: string }
 */
export function parseMarker(value) {
  if (typeof value !== 'string') {
    return { type: 'static', value };
  }

  // Check for marker patterns
  if (value === '$input') {
    return { type: 'input' };
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

  // No marker - static value
  return { type: 'static', value };
}

/**
 * Render a form field based on parsed marker
 */
export function renderField(key, marker, defaultValue = '', path = '') {
  const fieldId = `pc-field-${path}${key}`.replace(/\./g, '-');

  switch (marker.type) {
    case 'input':
      return `
        <div class="promptcanvas-field">
          <label class="promptcanvas-label" for="${fieldId}">${key}</label>
          <input type="text" 
                 class="promptcanvas-input" 
                 id="${fieldId}" 
                 data-path="${path}${key}"
                 value="${escapeHtml(defaultValue)}"
                 placeholder="${key}">
        </div>
      `;

    case 'select':
      const datalistId = `${fieldId}-list`;
      const optionsHtml = marker.options.map(opt =>
        `<option value="${escapeHtml(opt)}">`
      ).join('');
      return `
        <div class="promptcanvas-field">
          <label class="promptcanvas-label" for="${fieldId}">${key}</label>
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
          <label class="promptcanvas-label">${key}</label>
          <div class="promptcanvas-static" data-path="${path}${key}" data-static="true">${escapeHtml(marker.value)}</div>
        </div>
      `;

    default:
      return '';
  }
}

/**
 * Render an array field with add/remove functionality
 */
export function renderArrayField(key, schemaName, schemas, items = [], path = '') {
  const arrayPath = `${path}${key}`;
  const schema = schemas[schemaName] || schemas[`$schemas.${schemaName}`];

  let itemsHtml = '';

  // Render existing items (allow empty arrays - length 0)
  items.forEach((item, index) => {
    itemsHtml += renderArrayItem(key, index, schema, schemas, item, arrayPath);
  });

  return `
    <div class="promptcanvas-section">
      <div class="promptcanvas-section-header">
        <span class="promptcanvas-section-title">${key}</span>
      </div>
      <div class="promptcanvas-array-container" data-array="${arrayPath}" data-schema="${schemaName}">
        ${itemsHtml}
        <button type="button" class="promptcanvas-add-btn" data-add-to="${arrayPath}">
          <span>+</span> ${key} 추가
        </button>
      </div>
    </div>
  `;
}

/**
 * Render a single array item
 */
export function renderArrayItem(key, index, schema, schemas, values = {}, arrayPath = '') {
  const itemPath = `${arrayPath}[${index}].`;

  let fieldsHtml = '';

  // Handle simple string schema (e.g., "$input:Label")
  if (typeof schema === 'string') {
    const marker = parseMarker(schema);
    // Extract the actual value: could be string, or object with 'value' key, or undefined
    let defaultValue = '';
    if (typeof values === 'string') {
      defaultValue = values;
    } else if (values && typeof values === 'object' && 'value' in values) {
      defaultValue = values.value;
    }
    fieldsHtml = renderField('value', marker, defaultValue, itemPath);
  } else {
    // Handle object schema
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
          🗑 삭제
        </button>
      </div>
      ${fieldsHtml}
    </div>
  `;
}

/**
 * Render a nested object
 */
export function renderNestedObject(key, obj, schemas, values = {}, path = '') {
  const nestedPath = `${path}${key}.`;
  let fieldsHtml = '';

  for (const [fieldKey, fieldValue] of Object.entries(obj)) {
    // Skip $schemas and _meta
    if (fieldKey.startsWith('$') || fieldKey === '_meta') continue;

    if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
      // Nested object
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
        <span class="promptcanvas-section-title">${key}</span>
      </div>
      <div class="promptcanvas-nested">
        ${fieldsHtml}
      </div>
    </div>
  `;
}

/**
 * Render the complete form from a template
 */
export function renderForm(template, values = {}) {
  let html = '';
  const schemas = template.$schemas || {};

  // Also check for schemas defined with dot notation
  for (const [key, value] of Object.entries(template)) {
    if (key.startsWith('$schemas.')) {
      schemas[key] = value;
    }
  }

  for (const [key, value] of Object.entries(template)) {
    // Skip meta fields and schema definitions
    if (key === '_meta' || key === '$schemas' || key.startsWith('$schemas.')) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object
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

/**
 * Collect form values from DOM
 */
export function collectFormValues(container) {
  const result = {};

  // Collect regular inputs and selects
  container.querySelectorAll('.promptcanvas-input, .promptcanvas-select, .promptcanvas-textarea').forEach(el => {
    const path = el.dataset.path;
    if (path) {
      setNestedValue(result, path, el.value);
    }
  });

  // Collect static values
  container.querySelectorAll('[data-static="true"]').forEach(el => {
    const path = el.dataset.path;
    if (path) {
      setNestedValue(result, path, el.textContent);
    }
  });

  return result;
}

/**
 * Generate final JSON output from template and values
 */
export function generateOutput(template, values) {
  const output = {};

  // Collect all schemas including dot notation
  const allSchemas = { ...(template.$schemas || {}) };
  for (const [key, value] of Object.entries(template)) {
    if (key.startsWith('$schemas.')) {
      const schemaName = key.replace('$schemas.', '');
      allSchemas[schemaName] = value;
    }
  }

  for (const [key, value] of Object.entries(template)) {
    // Skip meta fields and schema definitions
    if (key === '_meta' || key === '$schemas' || key.startsWith('$schemas.')) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object - recursively process
      output[key] = generateOutputObject(value, values[key] || {}, allSchemas);
    } else {
      const marker = parseMarker(value);
      if (marker.type === 'array') {
        const arrValues = values[key] || [];
        // Check if this is a simple string schema (not object schema)
        const schemaValue = allSchemas[marker.schemaName];
        if (typeof schemaValue === 'string') {
          // Simple string schema - extract just the value strings
          output[key] = arrValues.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'value' in item) return item.value;
            return '';
          });
        } else {
          output[key] = arrValues;
        }
      } else if (marker.type === 'static') {
        output[key] = marker.value;
      } else {
        output[key] = values[key] || '';
      }
    }
  }

  return output;
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
        const arrValues = values[key] || [];
        // Check if this is a simple string schema (not object schema)
        const schemaValue = schemas[marker.schemaName];
        if (typeof schemaValue === 'string') {
          // Simple string schema - extract just the value strings
          output[key] = arrValues.map(item => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && 'value' in item) return item.value;
            return '';
          });
        } else {
          output[key] = arrValues;
        }
      } else if (marker.type === 'static') {
        output[key] = marker.value;
      } else {
        output[key] = values[key] || '';
      }
    }
  }

  return output;
}

// Utility functions
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setNestedValue(obj, path, value) {
  // Parse path like "character[0].name" or "style.mood"
  const regex = /([^.\[\]]+)|\[(\d+)\]/g;
  const parts = [];
  let match;

  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      parts.push(match[1]);
    } else if (match[2] !== undefined) {
      parts.push(parseInt(match[2], 10));
    }
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
