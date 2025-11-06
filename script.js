let isOrbitMode = false;
let currentMode = 'single';
let bulkData = [];
let originalBulkData = []; // Store original for revert
let currentPolygonCoords = null;
let originalPolygonCoords = null;
let hoveredNodeIndex = null;
let currentCanvasId = null;
let lockedNodeIndex = null;
let isDraggingBubble = false;
let bubbleDragStartX = 0;
let bubbleDragStartY = 0;
let bubbleOffsetX = 0;
let bubbleOffsetY = 0;

let zoomLevel = 1;
let panOffsetX = 0;
let panOffsetY = 0;
let isDraggingMap = false;
let mapDragStartX = 0;
let mapDragStartY = 0;

// Bulk page pagination and selection
let currentPage = 1;
let pageSize = 50;
let totalPages = 1;
let selectedRows = new Set();
let allColumns = [];
let idColumn = 'ID';
let polygonColumn = 'Polygon';
let uploadedFile = null;
let uploadedWorkbook = null;
let processingErrors = [];
let eudrPropertyMapping = {
    ProducerName: null,
    ProducerCountry: null,
    ProductionPlace: null,
    Area: '_calculate'
};
let activeFilters = {
    shape: [],
    states: [],
    rules: []
};
let filteredData = [];

// Tools dropdown toggle
function toggleToolsDropdown() {
    const dropdown = document.getElementById('toolsDropdown');
    dropdown.classList.toggle('active');
    updateToolsState();
}

// Update tools state (enable/disable based on polygon state)
function updateToolsState() {
    if (!originalPolygonCoords) return;
    
    const validation = validatePolygon(originalPolygonCoords);
    const duplicates = findDuplicateNodes(originalPolygonCoords);
    const isRightHand = validation.handRule === 'Right Hand Rule';
    
    const convertItem = document.getElementById('convertToolItem');
    const removeDuplicatesItem = document.getElementById('removeDuplicatesToolItem');
    
    // Disable convert if already Right Hand Rule
    if (isRightHand) {
        convertItem.classList.add('disabled');
    } else {
        convertItem.classList.remove('disabled');
    }
    
    // Disable remove duplicates if none found
    if (duplicates.length === 0) {
        removeDuplicatesItem.classList.add('disabled');
    } else {
        removeDuplicatesItem.classList.remove('disabled');
    }
}

// Convert to Right Hand Rule
function convertToRightHandRule() {
    const convertItem = document.getElementById('convertToolItem');
    if (convertItem.classList.contains('disabled')) return;
    
    const jsonInput = document.getElementById('jsonInput');
    const jsonValue = jsonInput.value.trim();
    
    if (!jsonValue) {
        alert('Please paste a polygon first');
        return;
    }
    
    try {
        const polygon = JSON.parse(jsonValue);
        
        if (polygon.type === 'Point') {
            alert('Cannot convert a Point geometry');
            return;
        }
        
        if (!polygon.coordinates || !polygon.coordinates[0]) {
            alert('Invalid polygon format');
            return;
        }
        
        const coords = polygon.coordinates[0];
        
        if (coords.length < 2) {
            alert('Need at least 2 coordinates');
            return;
        }
        
        // Check if polygon is closed
        const firstCoord = coords[0];
        const lastCoord = coords[coords.length - 1];
        const isClosed = (firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1]);
        
        if (isClosed) {
            // For closed polygon: keep first, reverse middle, add closing node
            const middleCoords = coords.slice(1, -1); // Exclude first and last
            const reversedMiddle = middleCoords.reverse();
            polygon.coordinates[0] = [firstCoord, ...reversedMiddle, [firstCoord[0], firstCoord[1]]];
        } else {
            // For unclosed polygon: keep first node, reverse the rest
            const restCoords = coords.slice(1); // Everything except first
            const reversedRest = restCoords.reverse();
            polygon.coordinates[0] = [firstCoord, ...reversedRest];
        }
        
        // Update input
        jsonInput.value = JSON.stringify(polygon);
        
        // Close dropdown and auto-validate
        document.getElementById('toolsDropdown').classList.remove('active');
        validateSingle();
        
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
}

// Remove Duplicate Nodes
function removeDuplicateNodes() {
    const removeDuplicatesItem = document.getElementById('removeDuplicatesToolItem');
    if (removeDuplicatesItem.classList.contains('disabled')) return;
    
    const jsonInput = document.getElementById('jsonInput');
    const jsonValue = jsonInput.value.trim();
    
    if (!jsonValue) {
        alert('Please paste a polygon first');
        return;
    }
    
    try {
        const polygon = JSON.parse(jsonValue);
        
        if (polygon.type === 'Point') {
            alert('Cannot remove duplicates from a Point geometry');
            return;
        }
        
        if (!polygon.coordinates || !polygon.coordinates[0]) {
            alert('Invalid polygon format');
            return;
        }
        
        const coords = polygon.coordinates[0];
        const lastIndex = coords.length - 1;
        
        // Remove duplicates but keep first occurrence
        const seen = new Map();
        const cleaned = [];
        
        coords.forEach((coord, i) => {
            const key = `${coord[0]},${coord[1]}`;
            
            // Special handling for closing node pair (first and last)
            if ((i === 0 || i === lastIndex) && i === lastIndex) {
                // This is the closing node, always add it
                cleaned.push(coord);
            } else if (!seen.has(key)) {
                seen.set(key, true);
                cleaned.push(coord);
            }
        });
        
        // Ensure polygon is closed
        if (cleaned.length > 0) {
            const first = cleaned[0];
            const last = cleaned[cleaned.length - 1];
            
            if (first[0] !== last[0] || first[1] !== last[1]) {
                cleaned.push([first[0], first[1]]);
            }
        }
        
        polygon.coordinates[0] = cleaned;
        
        // Update input
        jsonInput.value = JSON.stringify(polygon);
        
        // Close dropdown and auto-validate
        document.getElementById('toolsDropdown').classList.remove('active');
        validateSingle();
        
        const duplicatesRemoved = coords.length - cleaned.length;
        if (duplicatesRemoved > 0) {
            alert(`Removed ${duplicatesRemoved} duplicate node(s)`);
        }
        
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const toolsContainer = document.querySelector('.tools-container');
    const dropdown = document.getElementById('toolsDropdown');
    
    if (dropdown && !toolsContainer.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

document.getElementById('coordToggle').addEventListener('click', function() {
    this.classList.toggle('active');
    const wasOrbitMode = isOrbitMode;
    isOrbitMode = this.classList.contains('active');
    
    document.getElementById('modeIndicator').textContent = isOrbitMode ? 'Orbit Mode' : 'Origin Mode';
    document.getElementById('formatHintText').textContent = isOrbitMode ? '[Longitude, Latitude]' : '[Latitude, Longitude]';
    
    if (currentMode === 'single') {
        const jsonInput = document.getElementById('jsonInput');
        const jsonValue = jsonInput.value.trim();
        
        if (jsonValue) {
            try {
                const polygon = JSON.parse(jsonValue);
                if (polygon.type === 'Point') {
                    return;
                }
                if (polygon.coordinates && polygon.coordinates[0]) {
                    polygon.coordinates[0] = polygon.coordinates[0].map(coord => [coord[1], coord[0]]);
                    jsonInput.value = JSON.stringify(polygon);
                    validateSingle();
                }
            } catch (e) {
                // Invalid JSON, ignore
            }
        }
    }
});

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        currentMode = this.dataset.mode;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(currentMode + 'View').classList.add('active');
    });
});

const uploadZone = document.getElementById('uploadZone');
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => uploadZone.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, () => uploadZone.classList.remove('dragover'), false);
});

uploadZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
        handleFileUpload(files[0]);
    }
}

function handleFile(event) {
    const file = event.target.files[0];
    if (file) handleFileUpload(file);
}

function handleFileUpload(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    uploadedFile = file;
    
    if (extension === 'csv') {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                detectColumns(results.data);
                processBulkData(results.data);
            }
        });
    } else if (extension === 'xlsx' || extension === 'xls') {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            uploadedWorkbook = XLSX.read(data, {type: 'array'});
            const firstSheet = uploadedWorkbook.Sheets[uploadedWorkbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            detectColumns(jsonData);
            processBulkData(jsonData);
        };
        reader.readAsArrayBuffer(file);
    } else if (extension === 'json') {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const jsonData = JSON.parse(e.target.result);
                processEudrJson(jsonData);
            } catch (error) {
                alert('Invalid JSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
}

function processEudrJson(eudrData) {
    if (eudrData.type !== 'FeatureCollection' || !eudrData.features) {
        alert('Invalid EUDR JSON format. Expected FeatureCollection.');
        return;
    }
    
    // Convert EUDR features to table format
    const tableData = eudrData.features.map((feature, index) => {
        const props = feature.properties || {};
        const geometry = feature.geometry;
        
        // Create a row object
        const row = {
            'ID': props.ProductionPlace || `Feature-${index + 1}`,
            'ProducerName': props.ProducerName || '',
            'ProducerCountry': props.ProducerCountry || '',
            'ProductionPlace': props.ProductionPlace || '',
            'Area': props.Area || 0,
            'Polygon': geometry ? JSON.stringify(geometry) : ''
        };
        
        return row;
    });
    
    // Set columns
    allColumns = ['ID', 'ProducerName', 'ProducerCountry', 'ProductionPlace', 'Area', 'Polygon'];
    idColumn = 'ID';
    polygonColumn = 'Polygon';
    
    // Show column mapping (but pre-populated)
    const mappingSection = document.getElementById('columnMapping');
    mappingSection.classList.remove('hidden');
    
    const idSelect = document.getElementById('idColumnSelect');
    const polygonSelect = document.getElementById('polygonColumnSelect');
    
    idSelect.innerHTML = allColumns.map(col => 
        `<option value="${col}" ${col === idColumn ? 'selected' : ''}>${col}</option>`
    ).join('');
    
    polygonSelect.innerHTML = allColumns.map(col => 
        `<option value="${col}" ${col === polygonColumn ? 'selected' : ''}>${col}</option>`
    ).join('');
    
    updateMappingStatus();
    
    // Process as bulk data
    processBulkData(tableData);
}

function detectColumns(data) {
    if (data.length === 0) return;
    
    allColumns = Object.keys(data[0]);
    
    // Auto-detect ID column
    const idCandidates = ['ID', 'Id', 'id', 'identifier', 'Identifier'];
    idColumn = allColumns.find(col => idCandidates.includes(col)) || allColumns[0];
    
    // Auto-detect Polygon column
    const polygonCandidates = ['Polygon', 'polygon', 'geometry', 'Geometry', 'geom', 'Geom'];
    polygonColumn = allColumns.find(col => polygonCandidates.includes(col)) || allColumns[1];
    
    // Show column mapping UI
    const mappingSection = document.getElementById('columnMapping');
    mappingSection.classList.remove('hidden');
    
    const idSelect = document.getElementById('idColumnSelect');
    const polygonSelect = document.getElementById('polygonColumnSelect');
    
    idSelect.innerHTML = allColumns.map(col => 
        `<option value="${col}" ${col === idColumn ? 'selected' : ''}>${col}</option>`
    ).join('');
    
    polygonSelect.innerHTML = allColumns.map(col => 
        `<option value="${col}" ${col === polygonColumn ? 'selected' : ''}>${col}</option>`
    ).join('');
    
    updateMappingStatus();
}

function updateColumnMapping() {
    idColumn = document.getElementById('idColumnSelect').value;
    polygonColumn = document.getElementById('polygonColumnSelect').value;
    updateMappingStatus();
    
    // Re-process data with new mapping
    if (uploadedFile) {
        const extension = uploadedFile.name.split('.').pop().toLowerCase();
        if (extension === 'csv') {
            Papa.parse(uploadedFile, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    processBulkData(results.data);
                }
            });
        } else if (uploadedWorkbook) {
            const firstSheet = uploadedWorkbook.Sheets[uploadedWorkbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            processBulkData(jsonData);
        }
    }
}

function updateMappingStatus() {
    const statusDiv = document.getElementById('mappingStatus');
    if (idColumn && polygonColumn && idColumn !== polygonColumn) {
        statusDiv.textContent = '✓ Columns mapped successfully';
        statusDiv.className = 'mapping-status success';
    } else {
        statusDiv.textContent = '⚠ Please select different columns';
        statusDiv.className = 'mapping-status warning';
    }
}

function resetUpload() {
    // Reset all state
    bulkData = [];
    originalBulkData = [];
    selectedRows.clear();
    currentPage = 1;
    uploadedFile = null;
    uploadedWorkbook = null;
    processingErrors = [];
    
    // Hide UI elements
    document.getElementById('columnMapping').classList.add('hidden');
    document.getElementById('bulkControls').classList.add('hidden');
    document.getElementById('paginationControls').classList.add('hidden');
    document.getElementById('bulkResults').innerHTML = '';
    
    // Reset file input
    document.getElementById('fileInput').value = '';
}

function processBulkData(data) {
    bulkData = data.map((row, index) => {
        const id = row[idColumn] || (index + 1);
        const polygonStr = row[polygonColumn] || '';
        
        let result = {
            rowIndex: index,
            id: id,
            polygonStr: polygonStr,
            originalPolygonStr: polygonStr, // Track original
            states: [],
            handRule: '',
            polygon: null,
            modified: false,
            modifiedActions: [],
            fullRow: {...row} // Keep full row data for export
        };

        if (!polygonStr || polygonStr.trim() === '') {
            result.states.push({text: 'Blank', type: 'warning'});
            return result;
        }

        try {
            const polygon = JSON.parse(polygonStr);
            result.polygon = polygon;
            
            if (polygon.type === 'Point') {
                result.states.push({text: 'Point', type: 'warning'});
                return result;
            }
            
            if (!polygon.coordinates || !polygon.coordinates[0]) {
                result.states.push({text: 'Invalid Format', type: 'error'});
                return result;
            }

            const coords = polygon.coordinates[0];
            
            if (coords.length < 1) {
                result.states.push({text: 'No Coordinates', type: 'error'});
                return result;
            }

            const convertedCoords = coords.map(coord => {
                return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
            });

            const validation = validatePolygon(convertedCoords);
            result.states = validation.states;
            result.handRule = validation.handRule;
        } catch (e) {
            result.states.push({text: 'Invalid JSON', type: 'error'});
        }

        return result;
    });
    
    // Store original data for revert
    originalBulkData = JSON.parse(JSON.stringify(bulkData));
    
    // Reset pagination
    currentPage = 1;
    totalPages = Math.ceil(bulkData.length / pageSize);
    
    // Show controls
    document.getElementById('bulkControls').classList.remove('hidden');
    document.getElementById('paginationControls').classList.remove('hidden');
    
    displayBulkResults();
    updatePaginationControls();
}

function resetUpload() {
    // Reset all state
    bulkData = [];
    originalBulkData = [];
    selectedRows.clear();
    currentPage = 1;
    uploadedFile = null;
    uploadedWorkbook = null;
    processingErrors = [];
    activeFilters = { shape: [], states: [], rules: [] };
    filteredData = [];
    
    // Hide UI elements
    document.getElementById('columnMapping').classList.add('hidden');
    document.getElementById('bulkControls').classList.add('hidden');
    document.getElementById('paginationControls').classList.add('hidden');
    document.getElementById('bulkResults').innerHTML = '';
    
    // Reset file input
    document.getElementById('fileInput').value = '';
}

// Filter functions
function applyFilters() {
    // Start with all data
    filteredData = bulkData.map((item, idx) => ({...item, originalIndex: idx}));
    
    // Apply shape filter
    if (activeFilters.shape.length > 0) {
        filteredData = filteredData.filter(item => {
            const shape = item.polygon ? (item.polygon.type || 'Polygon') : '-';
            return activeFilters.shape.includes(shape);
        });
    }
    
    // Apply states filter (AND logic - must have ALL selected states)
    if (activeFilters.states.length > 0) {
        filteredData = filteredData.filter(item => {
            const itemStates = item.states.map(s => s.text);
            // Check if item has ALL selected states
            return activeFilters.states.every(filterState => itemStates.includes(filterState));
        });
    }
    
    // Apply rules filter
    if (activeFilters.rules.length > 0) {
        filteredData = filteredData.filter(item => {
            return activeFilters.rules.includes(item.handRule);
        });
    }
    
    // Update total pages based on filtered data
    totalPages = Math.ceil(filteredData.length / pageSize);
    if (totalPages === 0) totalPages = 1;
    if (currentPage > totalPages) currentPage = totalPages;
}

function getUniqueValues(column) {
    const valuesMap = new Map();
    
    bulkData.forEach(item => {
        if (column === 'shape') {
            const shape = item.polygon ? (item.polygon.type || 'Polygon') : '-';
            valuesMap.set(shape, (valuesMap.get(shape) || 0) + 1);
        } else if (column === 'states') {
            item.states.forEach(state => {
                valuesMap.set(state.text, (valuesMap.get(state.text) || 0) + 1);
            });
        } else if (column === 'rules') {
            if (item.handRule) {
                valuesMap.set(item.handRule, (valuesMap.get(item.handRule) || 0) + 1);
            }
        }
    });
    
    return Array.from(valuesMap.entries()).map(([value, count]) => ({value, count}));
}

function toggleColumnFilter(column, event) {
    event.stopPropagation();
    
    // Close other filter dropdowns
    document.querySelectorAll('.column-filter-dropdown').forEach(d => {
        if (!d.id.includes(column)) {
            d.classList.remove('active');
        }
    });
    
    const dropdown = document.getElementById(`filter-${column}`);
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

function addFilterDropdowns() {
    const headers = document.querySelectorAll('.filter-header');
    
    headers.forEach(header => {
        const column = header.onclick.toString().match(/'(\w+)'/)[1];
        
        // Remove existing dropdown if any
        const existingDropdown = document.getElementById(`filter-${column}`);
        if (existingDropdown) existingDropdown.remove();
        
        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.id = `filter-${column}`;
        dropdown.className = 'column-filter-dropdown';
        
        const uniqueValues = getUniqueValues(column);
        
        dropdown.innerHTML = uniqueValues.map(({value, count}) => {
            const isChecked = activeFilters[column].includes(value);
            return `
                <div class="filter-option" onclick="toggleFilterOption('${column}', '${value}', event)">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
                    <span class="filter-option-label">${value}</span>
                    <span class="filter-option-count">(${count})</span>
                </div>
            `;
        }).join('');
        
        header.appendChild(dropdown);
        
        // Update header appearance if filter is active
        if (activeFilters[column].length > 0) {
            header.classList.add('active');
        } else {
            header.classList.remove('active');
        }
    });
}

function toggleFilterOption(column, value, event) {
    event.stopPropagation();
    
    const index = activeFilters[column].indexOf(value);
    if (index > -1) {
        activeFilters[column].splice(index, 1);
    } else {
        activeFilters[column].push(value);
    }
    
    // Reset to page 1 when filters change
    currentPage = 1;
    
    displayBulkResults();
    updatePaginationControls();
}

function clearAllFilters() {
    activeFilters = { shape: [], states: [], rules: [] };
    currentPage = 1;
    displayBulkResults();
    updatePaginationControls();
}

function updateFilterIndicator() {
    const indicator = document.getElementById('filterIndicator');
    const hasActiveFilters = activeFilters.shape.length > 0 || 
                            activeFilters.states.length > 0 || 
                            activeFilters.rules.length > 0;
    
    if (hasActiveFilters) {
        indicator.classList.remove('hidden');
        document.getElementById('filteredCount').textContent = filteredData.length;
        document.getElementById('totalRowsCount').textContent = bulkData.length;
    } else {
        indicator.classList.add('hidden');
    }
}

function displayBulkResults() {
    const container = document.getElementById('bulkResults');
    
    if (bulkData.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No data to display</p></div>';
        return;
    }

    // Apply filters to get filtered dataset
    applyFilters();
    
    // Calculate pagination based on filtered data
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, filteredData.length);
    const pageData = filteredData.slice(startIdx, endIdx);

    let html = '<table class="results-table"><thead><tr>';
    html += '<th><input type="checkbox" class="row-checkbox" id="headerCheckbox" onchange="togglePageSelection()"></th>';
    html += '<th>ID</th>';
    html += '<th class="filter-header" onclick="toggleColumnFilter(\'shape\', event)">Polygon Shape</th>';
    html += '<th class="filter-header" onclick="toggleColumnFilter(\'states\', event)">States</th>';
    html += '<th class="filter-header" onclick="toggleColumnFilter(\'rules\', event)">Rules Type</th>';
    html += '<th style="width: 100px;">Tools</th><th style="width: 80px;"></th>';
    html += '</tr></thead><tbody>';
    
    pageData.forEach((item) => {
        const globalIdx = item.originalIndex;
        const isSelected = selectedRows.has(globalIdx);
        const shape = item.polygon ? (item.polygon.type || 'Polygon') : '-';
        const statesBadges = item.states.map(s => 
            `<span class="status-badge status-${s.type}">${s.text}</span>`
        ).join('');
        
        const handRuleBadge = item.handRule ? `<span class="status-badge status-info">${item.handRule}</span>` : '-';
        
        const canVisualize = item.polygon && item.polygon.coordinates && item.polygon.coordinates[0] && item.polygon.coordinates[0].length > 1;
        const mapBtn = canVisualize ? `<button class="map-btn" onclick="visualizePolygon(${globalIdx})">MAP</button>` : '';
        
        const modifiedBadge = item.modified ? '<span class="modified-badge">Modified</span>' : '';
        
        html += `<tr>
            <td><input type="checkbox" class="row-checkbox" data-idx="${globalIdx}" ${isSelected ? 'checked' : ''} onchange="toggleRowSelection(${globalIdx})"></td>
            <td>${item.id}${modifiedBadge}</td>
            <td>${shape}</td>
            <td>${statesBadges}</td>
            <td>${handRuleBadge}</td>
            <td class="tools-cell">
                <button class="row-tools-btn" onclick="toggleRowTools(${globalIdx}, event)">Tools ▼</button>
                <div class="row-tools-dropdown" id="tools-${globalIdx}">
                    <div class="row-tool-item" onclick="applyRowTool(${globalIdx}, 'autoClose')">Auto-Close Polygon</div>
                    <div class="row-tool-item" onclick="applyRowTool(${globalIdx}, 'convertRHR')">Convert to Right Hand Rule</div>
                    <div class="row-tool-item" onclick="applyRowTool(${globalIdx}, 'removeDuplicates')">Remove Duplicate Nodes</div>
                    <div class="row-tool-item" onclick="undoRow(${globalIdx})">↺ Undo to Original</div>
                </div>
            </td>
            <td>${mapBtn}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Add filter dropdowns to the DOM
    addFilterDropdowns();
    
    updateSelectedCount();
    updateFilterIndicator();
}

// Pagination functions
function updatePaginationControls() {
    const dataLength = filteredData.length || bulkData.length;
    
    document.getElementById('currentPageNum').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('totalRows').textContent = dataLength;
    document.getElementById('showingRange').textContent = 
        `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, dataLength)}`;
    
    document.getElementById('firstPageBtn').disabled = currentPage === 1;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
    document.getElementById('lastPageBtn').disabled = currentPage === totalPages;
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    displayBulkResults();
    updatePaginationControls();
}

function changePageSize() {
    pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    totalPages = Math.ceil(bulkData.length / pageSize);
    currentPage = 1;
    displayBulkResults();
    updatePaginationControls();
}

// Selection functions
function toggleSelectAllRows() {
    const isChecked = document.getElementById('selectAllCheckbox').checked;
    
    if (isChecked) {
        // Select all rows in filtered dataset
        filteredData.forEach(item => {
            selectedRows.add(item.originalIndex);
        });
    } else {
        // Deselect all rows in filtered dataset
        filteredData.forEach(item => {
            selectedRows.delete(item.originalIndex);
        });
    }
    
    displayBulkResults();
    updateSelectedCount();
}

function togglePageSelection() {
    toggleSelectAllRows();
}

function toggleRowSelection(idx) {
    if (selectedRows.has(idx)) {
        selectedRows.delete(idx);
    } else {
        selectedRows.add(idx);
    }
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = selectedRows.size;
    document.getElementById('selectedCount').textContent = count;
    document.getElementById('fixSelectedBtn').disabled = count === 0;
    
    // Update header checkbox state based on filtered data
    const allFilteredSelected = filteredData.length > 0 && 
        filteredData.every(item => selectedRows.has(item.originalIndex));
    
    const headerCheckbox = document.getElementById('headerCheckbox');
    if (headerCheckbox) {
        headerCheckbox.checked = allFilteredSelected;
    }
    
    // Update main select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = allFilteredSelected;
    }
}

// Row tools functions
function toggleRowTools(idx, event) {
    event.stopPropagation();
    const dropdown = document.getElementById(`tools-${idx}`);
    
    // Close all other dropdowns
    document.querySelectorAll('.row-tools-dropdown').forEach(d => {
        if (d.id !== `tools-${idx}`) {
            d.classList.remove('active');
        }
    });
    
    // Update tool states before showing
    updateRowToolStates(idx);
    
    // Toggle dropdown
    const wasActive = dropdown.classList.contains('active');
    dropdown.classList.toggle('active');
    
    // Smart positioning: check if dropdown will go off-screen
    if (dropdown.classList.contains('active')) {
        const rect = dropdown.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.top;
        
        // If not enough space below (less than dropdown height + 20px buffer)
        if (spaceBelow < 200) {
            // Position above instead
            dropdown.style.top = 'auto';
            dropdown.style.bottom = 'calc(100% + 5px)';
        } else {
            // Default position below
            dropdown.style.top = 'calc(100% + 5px)';
            dropdown.style.bottom = 'auto';
        }
    }
}

function updateRowToolStates(idx) {
    const item = bulkData[idx];
    if (!item || !item.polygon) return;
    
    const dropdown = document.getElementById(`tools-${idx}`);
    if (!dropdown) return;
    
    // Get current polygon state
    try {
        const polygon = JSON.parse(item.polygonStr);
        const coords = polygon.coordinates[0];
        
        // Check if closed
        const firstCoord = coords[0];
        const lastCoord = coords[coords.length - 1];
        const isClosed = (firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1]);
        
        // Check if right hand rule
        const convertedCoords = coords.map(coord => {
            return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
        });
        const isRightHand = checkRightHandRule(convertedCoords);
        
        // Check for duplicates
        const duplicates = findDuplicateNodes(convertedCoords);
        
        // Update dropdown items
        const tools = dropdown.querySelectorAll('.row-tool-item');
        tools.forEach(tool => {
            const toolText = tool.textContent.trim();
            
            // Auto-Close: disable if already closed
            if (toolText === 'Auto-Close Polygon') {
                if (isClosed) {
                    tool.classList.add('disabled');
                } else {
                    tool.classList.remove('disabled');
                }
            }
            
            // Convert to RHR: disable if already RHR
            if (toolText === 'Convert to Right Hand Rule') {
                if (isRightHand) {
                    tool.classList.add('disabled');
                } else {
                    tool.classList.remove('disabled');
                }
            }
            
            // Remove Duplicates: disable if no duplicates
            if (toolText === 'Remove Duplicate Nodes') {
                if (duplicates.length === 0) {
                    tool.classList.add('disabled');
                } else {
                    tool.classList.remove('disabled');
                }
            }
            
            // Undo: disable if not modified
            if (toolText.includes('Undo')) {
                if (!item.modified) {
                    tool.classList.add('disabled');
                } else {
                    tool.classList.remove('disabled');
                }
            }
        });
    } catch (e) {
        console.error('Error updating tool states:', e);
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('.tools-cell')) {
        document.querySelectorAll('.row-tools-dropdown').forEach(d => {
            d.classList.remove('active');
        });
    }
    
    if (!e.target.closest('.export-dropdown-container')) {
        document.getElementById('exportDropdown').classList.remove('active');
    }
    
    if (!e.target.closest('.filter-header')) {
        document.querySelectorAll('.column-filter-dropdown').forEach(d => {
            d.classList.remove('active');
        });
    }
});

function toggleExportDropdown() {
    document.getElementById('exportDropdown').classList.toggle('active');
}

function applyRowTool(idx, tool) {
    // Check if tool is disabled
    const dropdown = document.getElementById(`tools-${idx}`);
    const toolItems = dropdown.querySelectorAll('.row-tool-item');
    let isDisabled = false;
    
    toolItems.forEach(item => {
        if (item.onclick && item.onclick.toString().includes(tool)) {
            if (item.classList.contains('disabled')) {
                isDisabled = true;
            }
        }
    });
    
    if (isDisabled) {
        dropdown.classList.remove('active');
        return;
    }
    
    const item = bulkData[idx];
    if (!item || !item.polygon || item.polygon.type === 'Point') return;
    
    try {
        const polygon = JSON.parse(item.polygonStr);
        const coords = polygon.coordinates[0];
        
        let modified = false;
        let action = '';
        
        if (tool === 'autoClose') {
            const firstCoord = coords[0];
            const lastCoord = coords[coords.length - 1];
            if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
                polygon.coordinates[0].push([firstCoord[0], firstCoord[1]]);
                modified = true;
                action = 'Auto-Closed';
            }
        } else if (tool === 'convertRHR') {
            const convertedCoords = coords.map(coord => {
                return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
            });
            const isRightHand = checkRightHandRule(convertedCoords);
            
            if (!isRightHand) {
                const firstCoord = coords[0];
                const lastCoord = coords[coords.length - 1];
                const isClosed = (firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1]);
                
                if (isClosed) {
                    const middleCoords = coords.slice(1, -1);
                    const reversedMiddle = middleCoords.reverse();
                    polygon.coordinates[0] = [firstCoord, ...reversedMiddle, [firstCoord[0], firstCoord[1]]];
                } else {
                    const restCoords = coords.slice(1);
                    const reversedRest = restCoords.reverse();
                    polygon.coordinates[0] = [firstCoord, ...reversedRest];
                }
                modified = true;
                action = 'Converted to RHR';
            }
        } else if (tool === 'removeDuplicates') {
            const lastIndex = coords.length - 1;
            const seen = new Map();
            const cleaned = [];
            
            coords.forEach((coord, i) => {
                const key = `${coord[0]},${coord[1]}`;
                if ((i === 0 || i === lastIndex) && i === lastIndex) {
                    cleaned.push(coord);
                } else if (!seen.has(key)) {
                    seen.set(key, true);
                    cleaned.push(coord);
                }
            });
            
            if (cleaned.length > 0) {
                const first = cleaned[0];
                const last = cleaned[cleaned.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                    cleaned.push([first[0], first[1]]);
                }
            }
            
            if (cleaned.length !== coords.length) {
                polygon.coordinates[0] = cleaned;
                modified = true;
                action = 'Removed Duplicates';
            }
        }
        
        if (modified) {
            item.polygonStr = JSON.stringify(polygon);
            item.polygon = polygon;
            item.modified = true;
            if (!item.modifiedActions.includes(action)) {
                item.modifiedActions.push(action);
            }
            
            // Update full row data
            item.fullRow[polygonColumn] = item.polygonStr;
            
            // Re-validate
            const convertedCoords = polygon.coordinates[0].map(coord => {
                return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
            });
            const validation = validatePolygon(convertedCoords);
            item.states = validation.states;
            item.handRule = validation.handRule;
            
            displayBulkResults();
            updatePaginationControls();
        }
    } catch (e) {
        console.error('Error applying tool:', e);
    }
    
    // Close dropdown
    document.getElementById(`tools-${idx}`).classList.remove('active');
}

function undoRow(idx) {
    const original = originalBulkData[idx];
    if (!original) return;
    
    bulkData[idx] = JSON.parse(JSON.stringify(original));
    displayBulkResults();
    updatePaginationControls();
    
    document.getElementById(`tools-${idx}`).classList.remove('active');
}

function revertToOriginal() {
    if (confirm('Are you sure you want to revert all changes to the original uploaded data?')) {
        bulkData = JSON.parse(JSON.stringify(originalBulkData));
        selectedRows.clear();
        displayBulkResults();
        updatePaginationControls();
    }
}

function revertToOriginal() {
    if (confirm('Are you sure you want to revert all changes to the original uploaded data?')) {
        bulkData = JSON.parse(JSON.stringify(originalBulkData));
        selectedRows.clear();
        displayBulkResults();
        updatePaginationControls();
    }
}

// Fix Selected bulk operation
function fixSelected() {
    if (selectedRows.size === 0) return;
    
    processingErrors = [];
    let successCount = 0;
    
    selectedRows.forEach(idx => {
        const item = bulkData[idx];
        if (!item || !item.polygon || item.polygon.type === 'Point') {
            processingErrors.push({
                id: item?.id || idx,
                originalRow: idx + 1,
                reason: 'Cannot process: Invalid polygon type or missing data'
            });
            return;
        }
        
        try {
            const polygon = JSON.parse(item.polygonStr);
            let coords = polygon.coordinates[0];
            let actions = [];
            
            // Step 1: Auto-close if needed
            const firstCoord = coords[0];
            const lastCoord = coords[coords.length - 1];
            if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
                coords.push([firstCoord[0], firstCoord[1]]);
                actions.push('Auto-Closed');
            }
            
            // Step 2: Remove duplicates
            const lastIndex = coords.length - 1;
            const seen = new Map();
            const cleaned = [];
            
            coords.forEach((coord, i) => {
                const key = `${coord[0]},${coord[1]}`;
                if ((i === 0 || i === lastIndex) && i === lastIndex) {
                    cleaned.push(coord);
                } else if (!seen.has(key)) {
                    seen.set(key, true);
                    cleaned.push(coord);
                }
            });
            
            if (cleaned.length > 0) {
                const first = cleaned[0];
                const last = cleaned[cleaned.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) {
                    cleaned.push([first[0], first[1]]);
                }
            }
            
            if (cleaned.length !== coords.length) {
                coords = cleaned;
                actions.push('Removed Duplicates');
            }
            
            // Step 3: Convert to Right Hand Rule if needed
            const convertedCoords = coords.map(coord => {
                return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
            });
            const isRightHand = checkRightHandRule(convertedCoords);
            
            if (!isRightHand) {
                const firstCoord = coords[0];
                const lastCoord = coords[coords.length - 1];
                const isClosed = (firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1]);
                
                if (isClosed) {
                    const middleCoords = coords.slice(1, -1);
                    const reversedMiddle = middleCoords.reverse();
                    coords = [firstCoord, ...reversedMiddle, [firstCoord[0], firstCoord[1]]];
                } else {
                    const restCoords = coords.slice(1);
                    const reversedRest = restCoords.reverse();
                    coords = [firstCoord, ...reversedRest];
                }
                actions.push('Converted to RHR');
            }
            
            // Update polygon
            polygon.coordinates[0] = coords;
            item.polygonStr = JSON.stringify(polygon);
            item.polygon = polygon;
            item.modified = true;
            item.modifiedActions = actions;
            item.fullRow[polygonColumn] = item.polygonStr;
            
            // Re-validate
            const finalConvertedCoords = coords.map(coord => {
                return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
            });
            const validation = validatePolygon(finalConvertedCoords);
            item.states = validation.states;
            item.handRule = validation.handRule;
            
            successCount++;
        } catch (e) {
            processingErrors.push({
                id: item?.id || idx,
                originalRow: idx + 1,
                reason: 'Error processing: ' + e.message
            });
        }
    });
    
    // Refresh display
    displayBulkResults();
    updatePaginationControls();
    
    // Show processing report
    showProcessingReport(successCount, processingErrors.length);
}

function showProcessingReport(successCount, errorCount) {
    const modal = document.getElementById('reportModal');
    const summary = document.getElementById('reportSummary');
    const errorsSection = document.getElementById('reportErrors');
    const errorsList = document.getElementById('reportErrorsList');
    
    summary.innerHTML = `
        <div class="report-stat">
            <div class="report-stat-number" style="color: #059669;">${successCount}</div>
            <div class="report-stat-label">Successfully Processed</div>
        </div>
        <div class="report-stat">
            <div class="report-stat-number" style="color: #dc2626;">${errorCount}</div>
            <div class="report-stat-label">Errors</div>
        </div>
    `;
    
    if (errorCount > 0) {
        errorsSection.classList.remove('hidden');
        errorsList.innerHTML = processingErrors.map(err => `
            <div class="error-row">
                <div class="error-row-id">Row ${err.originalRow} (ID: ${err.id})</div>
                <div class="error-row-reason">${err.reason}</div>
            </div>
        `).join('');
    } else {
        errorsSection.classList.add('hidden');
    }
    
    modal.classList.add('active');
}

function exportErrors() {
    if (processingErrors.length === 0) return;
    
    const errorData = processingErrors.map(err => ({
        'Row Number': err.originalRow,
        'ID': err.id,
        'Error Reason': err.reason
    }));
    
    const ws = XLSX.utils.json_to_sheet(errorData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'processing_errors.xlsx');
}

function exportErrors() {
    if (processingErrors.length === 0) return;
    
    const errorData = processingErrors.map(err => ({
        'Row Number': err.originalRow,
        'ID': err.id,
        'Error Reason': err.reason
    }));
    
    const ws = XLSX.utils.json_to_sheet(errorData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errors');
    XLSX.writeFile(wb, 'processing_errors.xlsx');
}

// Export functions
function exportData(format) {
    document.getElementById('exportDropdown').classList.remove('active');
    
    if (format === 'xlsx') {
        exportXLSX();
    } else if (format === 'csv') {
        exportCSV();
    } else if (format === 'eudr') {
        startEudrExport();
    }
}

function startEudrExport() {
    // Populate EUDR mapping dropdowns
    const selects = ['eudrProducerName', 'eudrProducerCountry', 'eudrProductionPlace', 'eudrArea'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (selectId === 'eudrArea') {
            // Area has special auto-calculate option
            select.innerHTML = '<option value="_calculate">📐 Auto-calculate from polygon</option>' +
                allColumns.map(col => `<option value="${col}">${col}</option>`).join('');
        } else {
            select.innerHTML = '<option value="">-- Not mapped --</option>' +
                allColumns.map(col => `<option value="${col}">${col}</option>`).join('');
        }
    });
    
    // Try auto-detect
    autoDetectEudrMapping();
    
    // Show mapping modal
    document.getElementById('eudrMappingModal').classList.add('active');
}

function autoDetectEudrMapping() {
    // Auto-detect ProducerName
    const producerNameCandidates = ['ProducerName', 'Producer Name', 'Producer', 'Name'];
    const producerNameCol = allColumns.find(col => producerNameCandidates.some(c => col.toLowerCase().includes(c.toLowerCase())));
    if (producerNameCol) document.getElementById('eudrProducerName').value = producerNameCol;
    
    // Auto-detect ProducerCountry
    const countryCandidates = ['ProducerCountry', 'Producer Country', 'Country'];
    const countryCol = allColumns.find(col => countryCandidates.some(c => col.toLowerCase().includes(c.toLowerCase())));
    if (countryCol) document.getElementById('eudrProducerCountry').value = countryCol;
    
    // Auto-detect ProductionPlace
    const placeCandidates = ['ProductionPlace', 'Production Place', 'Place', 'Location'];
    const placeCol = allColumns.find(col => placeCandidates.some(c => col.toLowerCase().includes(c.toLowerCase())));
    if (placeCol) document.getElementById('eudrProductionPlace').value = placeCol;
    
    // Auto-detect Area
    const areaCandidates = ['Area', 'Hectares', 'Ha'];
    const areaCol = allColumns.find(col => areaCandidates.some(c => col.toLowerCase() === c.toLowerCase()));
    if (areaCol) {
        document.getElementById('eudrArea').value = areaCol;
    } else {
        document.getElementById('eudrArea').value = '_calculate';
    }
}

function proceedToFilename() {
    // Save mapping
    eudrPropertyMapping.ProducerName = document.getElementById('eudrProducerName').value;
    eudrPropertyMapping.ProducerCountry = document.getElementById('eudrProducerCountry').value;
    eudrPropertyMapping.ProductionPlace = document.getElementById('eudrProductionPlace').value;
    eudrPropertyMapping.Area = document.getElementById('eudrArea').value;
    
    // Close mapping modal
    document.getElementById('eudrMappingModal').classList.remove('active');
    
    // Set default filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    document.getElementById('eudrFilename').value = `eudr_export_${timestamp}.json`;
    
    // Show filename modal
    document.getElementById('eudrFilenameModal').classList.add('active');
}

function exportXLSX() {
    try {
        // Prepare data for export
        const exportData = bulkData.map(item => {
            const row = {...item.fullRow};
            row[polygonColumn] = item.polygonStr; // Use modified polygon
            return row;
        });
        
        // Create worksheet from data
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Try to preserve original formatting if we have the workbook
        let wb;
        if (uploadedWorkbook) {
            // Clone the workbook
            wb = XLSX.utils.book_new();
            const sheetName = uploadedWorkbook.SheetNames[0];
            
            // Copy the original sheet structure
            wb.SheetNames = [sheetName];
            wb.Sheets[sheetName] = ws;
            
            // Note: Full formatting preservation requires more complex logic
            // This provides basic structure preservation
        } else {
            wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Data');
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        XLSX.writeFile(wb, `polygons_export_${timestamp}.xlsx`);
    } catch (e) {
        alert('Error exporting XLSX: ' + e.message);
    }
}

function exportCSV() {
    try {
        // Prepare data for export
        const exportData = bulkData.map(item => {
            const row = {...item.fullRow};
            row[polygonColumn] = item.polygonStr; // Use modified polygon
            return row;
        });
        
        // Convert to CSV using PapaParse
        const csv = Papa.unparse(exportData);
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        
        link.setAttribute('href', url);
        link.setAttribute('download', `polygons_export_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        alert('Error exporting CSV: ' + e.message);
    }
}

function proceedToFilename() {
    // Save mapping
    eudrPropertyMapping.ProducerName = document.getElementById('eudrProducerName').value;
    eudrPropertyMapping.ProducerCountry = document.getElementById('eudrProducerCountry').value;
    eudrPropertyMapping.ProductionPlace = document.getElementById('eudrProductionPlace').value;
    eudrPropertyMapping.Area = document.getElementById('eudrArea').value;
    
    // Close mapping modal
    document.getElementById('eudrMappingModal').classList.remove('active');
    
    // Set default filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    document.getElementById('eudrFilename').value = `eudr_export_${timestamp}.json`;
    
    // Show filename modal
    document.getElementById('eudrFilenameModal').classList.add('active');
}

function executeEudrExport() {
    const filename = document.getElementById('eudrFilename').value || 'eudr_export.json';
    
    // Build EUDR FeatureCollection
    const features = [];
    let validCount = 0;
    let nullGeometryCount = 0;
    let pointGeometryCount = 0;
    
    bulkData.forEach(item => {
        try {
            // Build properties
            const properties = {};
            
            if (eudrPropertyMapping.ProducerName && item.fullRow[eudrPropertyMapping.ProducerName]) {
                properties.ProducerName = item.fullRow[eudrPropertyMapping.ProducerName];
            }
            
            if (eudrPropertyMapping.ProducerCountry && item.fullRow[eudrPropertyMapping.ProducerCountry]) {
                properties.ProducerCountry = item.fullRow[eudrPropertyMapping.ProducerCountry];
            }
            
            if (eudrPropertyMapping.ProductionPlace && item.fullRow[eudrPropertyMapping.ProductionPlace]) {
                properties.ProductionPlace = item.fullRow[eudrPropertyMapping.ProductionPlace];
            }
            
            // Handle Area
            let area = 0;
            if (eudrPropertyMapping.Area === '_calculate') {
                // Calculate from polygon
                if (item.polygon && item.polygon.type === 'Polygon' && item.polygon.coordinates) {
                    area = calculateAreaInHectares(item.polygon.coordinates[0]);
                }
            } else if (eudrPropertyMapping.Area && item.fullRow[eudrPropertyMapping.Area]) {
                area = parseFloat(item.fullRow[eudrPropertyMapping.Area]) || 0;
            }
            properties.Area = parseFloat(area.toFixed(2));
            
            // Handle geometry
            let geometry = null;
            if (item.polygon) {
                if (item.polygon.type === 'Point') {
                    geometry = item.polygon;
                    pointGeometryCount++;
                } else if (item.polygon.type === 'Polygon') {
                    // Convert coordinates based on mode
                    const coords = item.polygon.coordinates[0].map(coord => {
                        // EUDR uses [longitude, latitude] (standard GeoJSON)
                        // If in Origin mode, coordinates are [lat, long] - need to swap
                        // If in Orbit mode, coordinates are [long, lat] - keep as is
                        return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
                    });
                    
                    geometry = {
                        type: 'Polygon',
                        coordinates: [coords]
                    };
                    validCount++;
                }
            } else {
                nullGeometryCount++;
            }
            
            features.push({
                type: 'Feature',
                properties: properties,
                geometry: geometry
            });
        } catch (e) {
            console.error('Error processing row:', e);
        }
    });
    
    const eudrJson = {
        type: 'FeatureCollection',
        features: features
    };
    
    // Download file
    const blob = new Blob([JSON.stringify(eudrJson, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close modal
    document.getElementById('eudrFilenameModal').classList.remove('active');
    
    // Show summary
    let summary = `✅ EUDR JSON exported successfully!\n\n`;
    summary += `✓ ${validCount} valid polygons\n`;
    if (nullGeometryCount > 0) summary += `⚠️ ${nullGeometryCount} features with null geometry\n`;
    if (pointGeometryCount > 0) summary += `⚠️ ${pointGeometryCount} features with Point geometry\n`;
    if (nullGeometryCount > 0 || pointGeometryCount > 0) {
        summary += `\nℹ️ These may need review for EUDR compliance`;
    }
    
    alert(summary);
}

function calculateAreaInHectares(coordinates) {
    if (!coordinates || coordinates.length < 3) return 0;
    
    // Use spherical excess formula for area calculation
    // This is a simplified version - for production use a library like Turf.js
    
    let area = 0;
    const R = 6378137; // Earth's radius in meters
    
    for (let i = 0; i < coordinates.length - 1; i++) {
        const p1 = coordinates[i];
        const p2 = coordinates[i + 1];
        
        // Convert to radians
        const lat1 = p1[1] * Math.PI / 180;
        const lat2 = p2[1] * Math.PI / 180;
        const lon1 = p1[0] * Math.PI / 180;
        const lon2 = p2[0] * Math.PI / 180;
        
        area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    
    area = Math.abs(area * R * R / 2);
    
    // Convert from square meters to hectares (1 hectare = 10,000 m²)
    return area / 10000;
}

function validateSingle() {
    const jsonInput = document.getElementById('jsonInput').value;
    
    try {
        const polygon = JSON.parse(jsonInput);
        
        if (polygon.type === 'Point') {
            displaySingleResults(polygon, {states: [{text: 'Point', type: 'warning'}], handRule: ''}, 1);
            
            const canvas = document.getElementById('singleCanvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            document.getElementById('jsonDisplay').classList.remove('hidden');
            document.getElementById('jsonDisplayContent').innerHTML = '<pre style="margin: 0; font-family: inherit;">' + JSON.stringify(polygon, null, 2) + '</pre>';
            return;
        }
        
        if (!polygon.coordinates || !polygon.coordinates[0]) {
            alert('Invalid polygon format');
            return;
        }

        const coords = polygon.coordinates[0];
        
        originalPolygonCoords = coords.map(coord => {
            return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
        });
        
        currentPolygonCoords = coords;
        const validation = validatePolygon(originalPolygonCoords);
        
        displaySingleResults(polygon, validation, coords.length);
        
        zoomLevel = 1;
        panOffsetX = 0;
        panOffsetY = 0;
        
        drawPolygon('singleCanvas', originalPolygonCoords);
        displayJsonWithHighlight(polygon);
        
        // Update tools state
        updateToolsState();
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
}

function displayJsonWithHighlight(polygon) {
    const displayDiv = document.getElementById('jsonDisplay');
    const contentDiv = document.getElementById('jsonDisplayContent');
    
    displayDiv.classList.remove('hidden');
    
    if (!originalPolygonCoords || originalPolygonCoords.length === 0) {
        contentDiv.innerHTML = '<p>No polygon data available</p>';
        return;
    }
    
    const coords = polygon.coordinates[0];
    const actualNodeCount = coords.length - 1;
    const duplicates = findDuplicateNodes(originalPolygonCoords);
    
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    originalPolygonCoords.forEach(coord => {
        const lon = coord[0];
        const lat = coord[1];
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    });
    
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    
    let html = `
        <div style="font-family: -apple-system, sans-serif; line-height: 1.8;">
            <p style="margin: 8px 0;"><strong>Unique Nodes:</strong> ${actualNodeCount}</p>
            <p style="margin: 8px 0;"><strong>Total Coordinates:</strong> ${coords.length} (including closing node)</p>
            <p style="margin: 8px 0;"><strong>Duplicate Nodes:</strong> ${duplicates.length > 0 ? duplicates.length + ' found' : 'None'}</p>
            <p style="margin: 8px 0;"><strong>Center Point:</strong> [${centerLon.toFixed(6)}, ${centerLat.toFixed(6)}]</p>
            <p style="margin: 8px 0;"><strong>Bounding Box:</strong></p>
            <ul style="margin-left: 20px; margin-top: 4px;">
                <li style="margin: 4px 0;">Longitude: ${minLon.toFixed(6)} to ${maxLon.toFixed(6)}</li>
                <li style="margin: 4px 0;">Latitude: ${minLat.toFixed(6)} to ${maxLat.toFixed(6)}</li>
            </ul>
        </div>
    `;
    
    contentDiv.innerHTML = html;
}

function clearSingle() {
    document.getElementById('jsonInput').value = '';
    document.getElementById('singleResults').innerHTML = '';
    document.getElementById('jsonDisplay').classList.add('hidden');
    
    const canvas = document.getElementById('singleCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    originalPolygonCoords = null;
    currentPolygonCoords = null;
    hoveredNodeIndex = null;
    lockedNodeIndex = null;
    zoomLevel = 1;
    panOffsetX = 0;
    panOffsetY = 0;
    hideCoordBubble();
}

function displaySingleResults(polygon, validation, nodeCount) {
    const container = document.getElementById('singleResults');
    
    const statesBadges = validation.states.map(s => 
        `<span class="status-badge status-${s.type}">${s.text}</span>`
    ).join('');
    
    const handRuleBadge = validation.handRule ? `<span class="status-badge status-info">${validation.handRule}</span>` : '';
    
    const actualNodeCount = polygon.type === 'Point' ? nodeCount : (nodeCount > 0 ? nodeCount - 1 : nodeCount);
    
    let html = '<table class="results-table"><thead><tr><th>Polygon Shape</th><th>States</th><th>Rules Type</th><th>Node Count</th></tr></thead><tbody>';
    html += `<tr><td>${polygon.type || 'Polygon'}</td><td>${statesBadges}</td><td>${handRuleBadge}</td><td>${actualNodeCount}</td></tr>`;
    html += '</tbody></table>';
    
    container.innerHTML = html;
}

function validatePolygon(coords) {
    const states = [];
    let handRule = '';
    
    const firstCoord = coords[0];
    const lastCoord = coords[coords.length - 1];
    if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
        states.push({text: 'Not Closed (First ≠ Last)', type: 'error'});
    }
    
    if (coords.length < 4) {
        states.push({text: 'Insufficient Nodes (needs ≥4)', type: 'error'});
    }
    
    const duplicates = findDuplicateNodes(coords);
    if (duplicates.length > 0) {
        states.push({text: 'Duplicate Nodes', type: 'error'});
    }
    
    if (isSelfIntersecting(coords)) {
        states.push({text: 'Self-Intersecting', type: 'error'});
    }
    
    const isRightHand = checkRightHandRule(coords);
    handRule = isRightHand ? 'Right Hand Rule' : 'Left Hand Rule';
    
    if (states.length === 0) {
        states.push({text: 'Valid', type: 'valid'});
    }
    
    return { states, handRule };
}

function findDuplicateNodes(coords) {
    const duplicates = [];
    const lastIndex = coords.length - 1;
    
    for (let i = 0; i < coords.length; i++) {
        for (let j = i + 1; j < coords.length; j++) {
            if ((i === 0 && j === lastIndex) || (j === 0 && i === lastIndex)) {
                continue;
            }
            
            if (coords[i][0] === coords[j][0] && coords[i][1] === coords[j][1]) {
                if (!duplicates.includes(i)) duplicates.push(i);
                if (!duplicates.includes(j)) duplicates.push(j);
            }
        }
    }
    return duplicates;
}

function isSelfIntersecting(coords) {
    for (let i = 0; i < coords.length - 1; i++) {
        for (let j = i + 2; j < coords.length - 1; j++) {
            if (i === 0 && j === coords.length - 2) continue;
            
            if (segmentsIntersect(coords[i], coords[i + 1], coords[j], coords[j + 1])) {
                return true;
            }
        }
    }
    return false;
}

function segmentsIntersect(p1, p2, p3, p4) {
    const ccw = (A, B, C) => {
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    };
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

function checkRightHandRule(coords) {
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
        const j = (i + 1) % coords.length;
        area += coords[i][0] * coords[j][1];
        area -= coords[j][0] * coords[i][1];
    }
    area = area / 2;
    return area > 0;
}

function drawPolygon(canvasId, coords) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    
    currentCanvasId = canvasId;
    
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (coords.length < 2) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    coords.forEach(coord => {
        const x = coord[0];
        const y = coord[1];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });
    
    const padding = 60;
    const baseScaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
    const baseScaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
    const baseScale = Math.min(baseScaleX, baseScaleY);
    
    const scale = baseScale * zoomLevel;
    
    const baseOffsetX = (canvas.width - (maxX - minX) * baseScale) / 2 - minX * baseScale;
    const baseOffsetY = (canvas.height - (maxY - minY) * baseScale) / 2 - minY * baseScale;
    
    const offsetX = baseOffsetX + panOffsetX;
    const offsetY = baseOffsetY + panOffsetY;
    
    canvas.coordTransform = { scale, offsetX, offsetY, minX, minY, maxX, maxY };
    
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    
    ctx.beginPath();
    coords.forEach((coord, i) => {
        const x = coord[0];
        const y = coord[1];
        const px = x * scale + offsetX;
        const py = canvas.height - (y * scale + offsetY);
        
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    const nodeSize = coords.length > 100 ? 4 : 6;
    const duplicates = findDuplicateNodes(coords);
    
    coords.forEach((coord, i) => {
        if (i === 0) return;
        
        const x = coord[0];
        const y = coord[1];
        const px = x * scale + offsetX;
        const py = canvas.height - (y * scale + offsetY);
        
        let fillColor;
        if (hoveredNodeIndex === i) {
            fillColor = '#16a34a';
        } else if (duplicates.includes(i)) {
            fillColor = '#ef4444';
        } else {
            fillColor = '#2563eb';
        }
        
        ctx.beginPath();
        ctx.arc(px, py, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const numOffset = 15;
        let numX = px;
        let numY = py - numOffset;
        
        if (py < 30) numY = py + numOffset;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(numX - 10, numY - 8, 20, 16);
        
        ctx.fillStyle = '#1e293b';
        ctx.fillText((i + 1).toString(), numX, numY);
    });
    
    const firstCoord = coords[0];
    const x0 = firstCoord[0];
    const y0 = firstCoord[1];
    const px0 = x0 * scale + offsetX;
    const py0 = canvas.height - (y0 * scale + offsetY);
    
    ctx.beginPath();
    ctx.arc(px0, py0, nodeSize, 0, Math.PI * 2);
    ctx.fillStyle = hoveredNodeIndex === 0 ? '#16a34a' : '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const numOffset0 = 15;
    let numX0 = px0;
    let numY0 = py0 - numOffset0;
    
    if (py0 < 30) numY0 = py0 + numOffset0;
    
    ctx.fillStyle = 'white';
    ctx.fillRect(numX0 - 10, numY0 - 8, 20, 16);
    
    ctx.fillStyle = '#1e293b';
    ctx.fillText('1', numX0, numY0);
}

function visualizePolygon(index) {
    const item = bulkData[index];
    if (!item.polygon) return;
    
    const coords = item.polygon.coordinates[0];
    
    originalPolygonCoords = coords.map(coord => {
        return isOrbitMode ? [coord[0], coord[1]] : [coord[1], coord[0]];
    });
    
    currentPolygonCoords = coords;
    
    document.getElementById('modalTitle').textContent = `Polygon: ${item.id}`;
    const actualNodeCount = coords.length - 1;
    document.getElementById('nodeCount').textContent = actualNodeCount;
    
    setTimeout(() => {
        drawPolygon('modalCanvas', originalPolygonCoords);
    }, 100);
    
    const nodeList = document.getElementById('nodeList');
    const duplicates = findDuplicateNodes(originalPolygonCoords);
    const lastIndex = coords.length - 1;
    
    nodeList.innerHTML = coords.map((coord, i) => {
        const displayCoord1 = coord[0];
        const displayCoord2 = coord[1];
        
        const isDupe = duplicates.includes(i);
        const isStart = i === 0;
        const isEnd = i === lastIndex;
        const classes = ['node-item'];
        
        if (isEnd) {
            classes.push('end-node');
        } else if (isDupe) {
            classes.push('duplicate');
        } else if (isStart) {
            classes.push('start-node');
        }
        
        let label = `<strong>Node ${i + 1}</strong>`;
        if (isStart) label += ' 🟠 Start';
        if (isEnd) label += ' ⚪ End';
        if (isDupe && !isEnd) label += ' 🔴 Duplicate';
        
        const mouseEvents = isEnd ? '' : `onmouseenter="highlightNode(${i})" onmouseleave="unhighlightNode()"`;
        
        return `<li class="${classes.join(' ')}" ${mouseEvents}>
            ${label}
            <div class="node-coords">${displayCoord1}, ${displayCoord2}</div>
        </li>`;
    }).join('');
    
    document.getElementById('vizModal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    hoveredNodeIndex = null;
    
    // Clear report data when closing report modal
    if (modalId === 'reportModal') {
        processingErrors = [];
    }
}

function highlightNode(index) {
    hoveredNodeIndex = index;
    
    document.querySelectorAll('.node-item').forEach((item, i) => {
        if (i === index) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    if (currentCanvasId && originalPolygonCoords) {
        drawPolygon(currentCanvasId, originalPolygonCoords);
    }
}

function unhighlightNode() {
    hoveredNodeIndex = null;
    
    document.querySelectorAll('.node-item').forEach(item => {
        item.classList.remove('active');
    });
    
    if (currentCanvasId && originalPolygonCoords) {
        drawPolygon(currentCanvasId, originalPolygonCoords);
    }
}

function handleCanvasHover(e, canvas, coords) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const transform = canvas.coordTransform;
    if (!transform) return;
    
    const { scale, offsetX, offsetY } = transform;
    
    let foundNode = -1;
    const threshold = 12;
    
    for (let i = 0; i < coords.length; i++) {
        const x = coords[i][0];
        const y = coords[i][1];
        const px = x * scale + offsetX;
        const py = canvas.height - (y * scale + offsetY);
        
        const dist = Math.sqrt(Math.pow(mouseX - px, 2) + Math.pow(mouseY - py, 2));
        if (dist < threshold) {
            foundNode = i;
            break;
        }
    }
    
    if (foundNode !== hoveredNodeIndex) {
        if (foundNode >= 0) {
            highlightNode(foundNode);
            if (canvas.id === 'singleCanvas' && lockedNodeIndex === null) {
                showCoordBubble(foundNode, e.clientX, e.clientY);
            }
        } else {
            unhighlightNode();
            if (canvas.id === 'singleCanvas' && lockedNodeIndex === null) {
                hideCoordBubble();
            }
        }
    } else if (foundNode >= 0 && canvas.id === 'singleCanvas' && lockedNodeIndex === null) {
        updateBubblePosition(e.clientX, e.clientY);
    }
}

function showCoordBubble(nodeIndex, mouseX, mouseY) {
    if (!currentPolygonCoords) return;
    
    const bubble = document.getElementById('coordBubble');
    const coord = currentPolygonCoords[nodeIndex];
    
    const display1 = coord[0];
    const display2 = coord[1];
    const label = isOrbitMode ? 'Long, Lat' : 'Lat, Long';
    
    bubble.textContent = `Node ${nodeIndex + 1}: [${display1}, ${display2}] (${label})`;
    bubble.classList.add('active');
    
    updateBubblePosition(mouseX, mouseY);
}

function updateBubblePosition(mouseX, mouseY) {
    const bubble = document.getElementById('coordBubble');
    const container = document.getElementById('mapContainer');
    const rect = container.getBoundingClientRect();
    
    let bubbleX = mouseX - rect.left + bubbleOffsetX;
    let bubbleY = mouseY - rect.top - 40 + bubbleOffsetY;
    
    bubble.style.left = bubbleX + 'px';
    bubble.style.top = bubbleY + 'px';
    bubble.style.transform = 'translateX(-50%)';
}

function hideCoordBubble() {
    const bubble = document.getElementById('coordBubble');
    bubble.classList.remove('active');
    bubbleOffsetX = 0;
    bubbleOffsetY = 0;
}

function lockCoordBubble(nodeIndex) {
    const bubble = document.getElementById('coordBubble');
    lockedNodeIndex = nodeIndex;
    bubble.classList.add('locked');
}

function unlockCoordBubble() {
    const bubble = document.getElementById('coordBubble');
    lockedNodeIndex = null;
    bubble.classList.remove('locked');
    hideCoordBubble();
}

function autoClosePolygon() {
    const jsonInput = document.getElementById('jsonInput');
    const jsonValue = jsonInput.value.trim();
    
    if (!jsonValue) {
        alert('Please paste a polygon first');
        return;
    }
    
    try {
        const polygon = JSON.parse(jsonValue);
        
        if (polygon.type === 'Point') {
            alert('Cannot auto-close a Point geometry');
            return;
        }
        
        if (!polygon.coordinates || !polygon.coordinates[0]) {
            alert('Invalid polygon format');
            return;
        }
        
        const coords = polygon.coordinates[0];
        
        if (coords.length < 2) {
            alert('Need at least 2 coordinates to close a polygon');
            return;
        }
        
        const firstCoord = coords[0];
        const lastCoord = coords[coords.length - 1];
        
        if (firstCoord[0] === lastCoord[0] && firstCoord[1] === lastCoord[1]) {
            alert('Polygon is already closed!');
            return;
        }
        
        polygon.coordinates[0].push([firstCoord[0], firstCoord[1]]);
        jsonInput.value = JSON.stringify(polygon);
        
        document.getElementById('toolsDropdown').classList.remove('active');
        validateSingle();
        
    } catch (e) {
        alert('Invalid JSON: ' + e.message);
    }
}

function openHelp() {
    document.getElementById('helpModal').classList.add('active');
}

function toggleVersion(versionId) {
    const content = document.getElementById(versionId + '-content');
    const arrow = document.getElementById(versionId + '-arrow');
    content.classList.toggle('collapsed');
    arrow.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
}

function toggleOlderVersions() {
    const olderVersions = document.getElementById('olderVersions');
    const btn = document.getElementById('showMoreBtn');
    if (olderVersions.style.display === 'none') {
        olderVersions.style.display = 'block';
        btn.textContent = 'Hide Earlier Versions';
    } else {
        olderVersions.style.display = 'none';
        btn.textContent = 'Show Earlier Versions';
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal('vizModal');
        closeModal('helpModal');
        closeModal('reportModal');
        closeModal('eudrMappingModal');
        closeModal('eudrFilenameModal');
        document.getElementById('toolsDropdown').classList.remove('active');
        document.getElementById('exportDropdown').classList.remove('active');
        
        // Close all row tools dropdowns
        document.querySelectorAll('.row-tools-dropdown').forEach(d => {
            d.classList.remove('active');
        });
    }
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

window.addEventListener('resize', function() {
    if (originalPolygonCoords) {
        if (currentMode === 'single') {
            drawPolygon('singleCanvas', originalPolygonCoords);
        } else if (document.getElementById('vizModal').classList.contains('active')) {
            drawPolygon('modalCanvas', originalPolygonCoords);
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const coordBubble = document.getElementById('coordBubble');
    
    if (coordBubble) {
        coordBubble.addEventListener('mousedown', function(e) {
            if (!this.classList.contains('locked')) return;
            
            isDraggingBubble = true;
            bubbleDragStartX = e.clientX;
            bubbleDragStartY = e.clientY;
            this.classList.add('dragging');
            e.stopPropagation();
        });
    }
});

document.addEventListener('mousemove', function(e) {
    if (!isDraggingBubble) return;
    
    const deltaX = e.clientX - bubbleDragStartX;
    const deltaY = e.clientY - bubbleDragStartY;
    
    bubbleOffsetX += deltaX;
    bubbleOffsetY += deltaY;
    
    bubbleDragStartX = e.clientX;
    bubbleDragStartY = e.clientY;
    
    const bubble = document.getElementById('coordBubble');
    if (!bubble) return;
    
    const currentLeft = parseFloat(bubble.style.left) || 0;
    const currentTop = parseFloat(bubble.style.top) || 0;
    
    bubble.style.left = (currentLeft + deltaX) + 'px';
    bubble.style.top = (currentTop + deltaY) + 'px';
});

document.addEventListener('mouseup', function() {
    if (isDraggingBubble) {
        isDraggingBubble = false;
        const bubble = document.getElementById('coordBubble');
        if (bubble) bubble.classList.remove('dragging');
    }
});

const singleCanvas = document.getElementById('singleCanvas');

singleCanvas.addEventListener('wheel', function(e) {
    // Zoom disabled - only pan/drag is available
    // if (!originalPolygonCoords || currentMode !== 'single') return;
    // e.preventDefault();
    // 
    // const delta = e.deltaY > 0 ? 0.95 : 1.05;
    // const newZoom = zoomLevel * delta;
    // 
    // if (newZoom >= 0.3 && newZoom <= 5) {
    //     zoomLevel = newZoom;
    //     drawPolygon('singleCanvas', originalPolygonCoords);
    // }
});

singleCanvas.addEventListener('mousedown', function(e) {
    if (!originalPolygonCoords || currentMode !== 'single') return;
    isDraggingMap = true;
    mapDragStartX = e.clientX;
    mapDragStartY = e.clientY;
    singleCanvas.style.cursor = 'grabbing';
});

singleCanvas.addEventListener('mousemove', function(e) {
    if (!originalPolygonCoords || currentMode !== 'single') return;
    
    if (isDraggingMap) {
        const deltaX = e.clientX - mapDragStartX;
        const deltaY = e.clientY - mapDragStartY;
        
        panOffsetX += deltaX;
        panOffsetY -= deltaY;
        
        mapDragStartX = e.clientX;
        mapDragStartY = e.clientY;
        
        drawPolygon('singleCanvas', originalPolygonCoords);
    } else {
        handleCanvasHover(e, this, originalPolygonCoords);
    }
});

singleCanvas.addEventListener('mouseup', function() {
    if (currentMode !== 'single') return;
    isDraggingMap = false;
    singleCanvas.style.cursor = 'crosshair';
});

singleCanvas.addEventListener('mouseleave', function() {
    if (currentMode !== 'single') return;
    isDraggingMap = false;
    singleCanvas.style.cursor = 'crosshair';
    if (lockedNodeIndex === null) {
        unhighlightNode();
        hideCoordBubble();
    }
});

singleCanvas.addEventListener('click', function(e) {
    if (!originalPolygonCoords || currentMode !== 'single') return;
    if (isDraggingMap) return;
    
    const rect = this.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const transform = this.coordTransform;
    if (!transform) return;
    
    const { scale, offsetX, offsetY } = transform;
    
    let foundNode = -1;
    const threshold = 12;
    
    for (let i = 0; i < originalPolygonCoords.length; i++) {
        const x = originalPolygonCoords[i][0];
        const y = originalPolygonCoords[i][1];
        const px = x * scale + offsetX;
        const py = this.height - (y * scale + offsetY);
        
        const dist = Math.sqrt(Math.pow(mouseX - px, 2) + Math.pow(mouseY - py, 2));
        if (dist < threshold) {
            foundNode = i;
            break;
        }
    }
    
    if (foundNode >= 0) {
        if (lockedNodeIndex === foundNode) {
            unlockCoordBubble();
        } else {
            lockCoordBubble(foundNode);
            showCoordBubble(foundNode, e.clientX, e.clientY);
        }
    } else {
        unlockCoordBubble();
    }
});

const modalCanvas = document.getElementById('modalCanvas');

modalCanvas.addEventListener('mousemove', function(e) {
    if (!originalPolygonCoords) return;
    handleCanvasHover(e, this, originalPolygonCoords);
});

modalCanvas.addEventListener('mouseleave', function() {
    unhighlightNode();
});
