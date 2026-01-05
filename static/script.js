// ==================== LOGIN STATE ====================
const loginState = {
    isLoggedIn: false,
    username: null,
    selectedSubject: null,
    allowedSubject: null  
};
// ==================== STATE MANAGEMENT ====================

const state = {
    experiments: [],
    categories: [],
    filteredExperiments: [], 
    selectedExperiments: new Set(),
    expandedExperiments: new Set(),
    itemUsageType: new Map(),
    itemCustomQuantity: new Map(),
    currentResults: null,
    editingExperimentId: null,
    editingItemData: null,
    modalItems: [],
    modalEditingItemIndex: null,
    currentSubjectFilter: '',
    currentCategoryFilter: '',
    currentGradeFilter: '' 
};

const itemsCache = [];
const categoriesCache = [];

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    const savedLoginSession = sessionStorage.getItem('labLogin');
    const savedLoginLocal = localStorage.getItem('labLogin');
    const savedLogin = savedLoginSession || savedLoginLocal;  // Check both
    
    if (savedLogin) {
        const loginData = JSON.parse(savedLogin);
        loginState.isLoggedIn = true;
        loginState.username = loginData.username;
        loginState.selectedSubject = loginData.subject;
        loginState.allowedSubject = loginData.allowed_subject;
        closeModal('loginModal');
        initializeApp();
    } else {
        showLoginModal();
    }
    // loadCategories();
    // loadItems();
    // loadExperiments();
    // Item name input with filtering
    const itemNameInput = document.getElementById('itemName');
    if (itemNameInput) {
        itemNameInput.addEventListener('input', (e) => {
            filterItemsDatalist(e.target.value);
            handleItemSelection();
        });
        itemNameInput.addEventListener('change', handleItemSelection);
        itemNameInput.addEventListener('focus', () => {
            filterItemsDatalist(itemNameInput.value);
        });
    }
    
    // Category input with filtering
    const categoryInput = document.getElementById('experimentCategory');
    if (categoryInput) {
        categoryInput.addEventListener('input', (e) => {
            const selectedSubject = document.getElementById('experimentSubject').value;
            filterCategoriesDatalist(e.target.value, selectedSubject);
        });
        categoryInput.addEventListener('focus', () => {
            const selectedSubject = document.getElementById('experimentSubject').value;
            filterCategoriesDatalist(categoryInput.value, selectedSubject);
        });
    }
});

// ==================== API CALLS ====================

function showLoginModal() {
    // First load categories to populate subject dropdown
    fetch('/api/categories')
        .then(response => {
            if (!response.ok) {
                console.log('Not authenticated yet - showing login modal');
                return { categories: [] };
            }
            return response.json();
        })
        .then(data => {
            const subjects = [...new Set(data.categories.map(cat => cat.subject))].sort();
            const loginSubject = document.getElementById('loginSubject');
            loginSubject.innerHTML = '<option value="">Choose Subject</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                loginSubject.appendChild(option);
            });
        });
    
    // Add username change listener to auto-populate subject
    const loginUsername = document.getElementById('loginUsername');
    const loginSubject = document.getElementById('loginSubject');
    
    loginUsername.addEventListener('input', async function() {
        const username = this.value.trim();

        if (!username) {
            loginSubject.disabled = false;
            loginSubject.value = '';
            loginSubject.parentElement.style.display = 'block';
            return;
        }
        
        try {
            const res = await fetch(`/api/user-allowed-subject/${username}`);
            const data = await res.json();

            if (!data.exists) {
                // Unknown user → manual subject selection
                loginSubject.disabled = false;
                loginSubject.value = '';
                loginSubject.parentElement.style.display = 'block';
                return;
            }

            const allowed = data.allowed_subject;

            if (allowed === 'All') {
                // Admin
                loginSubject.value = '';
                loginSubject.disabled = true;
                loginSubject.parentElement.style.display = 'none';
            } else {
                // Auto-fill + lock
                loginSubject.value = allowed;
                loginSubject.disabled = true;
                loginSubject.style.cursor = 'not-allowed';
                loginSubject.style.opacity = '0.6';
                loginSubject.parentElement.style.display = 'block';
            }

        } catch (err) {
            console.error('Failed to fetch allowed subject', err);
        }
        
    });
    
    document.getElementById('loginModal').style.display = 'flex';
}
async function handleLogin(event) {
    event.preventDefault();
    
    // Clear any previous error
    const existingError = document.querySelector('.login-error-box');
    if (existingError) existingError.remove();
    
    const existingSuggestions = document.querySelector('.login-suggestions-box');
    if (existingSuggestions) existingSuggestions.remove();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    let subject = document.getElementById('loginSubject').value;
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : true;

    if (!subject && username === 'admin') {
        subject = 'All Subjects';
    }

    if (!username || !password) {
        showLoginError('Please fill in all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ username, password, subject, remember_me: rememberMe })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            
            // Handle username not found
            if (errorData.error_type === 'username_not_found') {
                showLoginError(
                    `Username "${username}" not found`,
                    errorData.similar_usernames,
                    'username'
                );
                return;
            }
            
            // Handle wrong password
            if (errorData.error_type === 'wrong_password') {
                showLoginError(
                    `Incorrect password for "${errorData.username}"`,
                    null,
                    'password'
                );
                return;
            }
            
            // Generic error
            throw new Error(errorData.error || 'Login failed');
        }
        
        const loginData = await response.json();
        
        // Save login state
        loginState.isLoggedIn = true;
        loginState.username = loginData.username;
        loginState.selectedSubject = loginData.subject;
        loginState.allowedSubject = loginData.allowed_subject;
        
        // Save to appropriate storage
        if (rememberMe) {
            localStorage.setItem('labLogin', JSON.stringify(loginData));
            sessionStorage.removeItem('labLogin');
        } else {
            sessionStorage.setItem('labLogin', JSON.stringify(loginData));
            localStorage.removeItem('labLogin');
        }
        
        closeModal('loginModal');
        
        await initializeApp();
        
        showSuccess(`Welcome, ${loginData.username}! Viewing: ${subject}`);
    } catch (error) {
        showLoginError(error.message || 'Login failed');
    }
}
function showLoginError(message, suggestions = null, fieldToFocus = null) {
    // Remove existing error and suggestions
    const existingError = document.querySelector('.login-error-box');
    if (existingError) existingError.remove();
    
    const existingSuggestions = document.querySelector('.login-suggestions-box');
    if (existingSuggestions) existingSuggestions.remove();
    
    // If there are suggestions, show suggestions box instead of error box
    if (suggestions && suggestions.length > 0) {
        const suggestionsBox = document.createElement('div');
        suggestionsBox.className = 'login-suggestions-box';
        
        suggestionsBox.innerHTML = `
            <div class="suggestions-title">💡 Did you mean:</div>
            <div class="suggestions-list">
                ${suggestions.map(user => `
                    <div class="suggestion-item" onclick="selectSuggestion('${user}')">
                        👤 ${user}
                    </div>
                `).join('')}
            </div>
            <div class="suggestions-hint">Click a username to auto-fill</div>
        `;
        
        const loginForm = document.getElementById('loginForm');
        loginForm.insertBefore(suggestionsBox, loginForm.firstChild);
    } else {
        // Show error box only for real errors (like wrong password)
        const errorBox = document.createElement('div');
        errorBox.className = 'login-error-box';
        
        errorBox.innerHTML = `
            <div class="error-title">❌ Login Error</div>
            <div class="error-message">${message}</div>
        `;
        
        const loginForm = document.getElementById('loginForm');
        loginForm.insertBefore(errorBox, loginForm.firstChild);
    }
    
    // Focus appropriate field
    if (fieldToFocus === 'username') {
        const usernameInput = document.getElementById('loginUsername');
        usernameInput.focus();
        usernameInput.select();
    } else if (fieldToFocus === 'password') {
        const passwordInput = document.getElementById('loginPassword');
        passwordInput.value = '';
        passwordInput.focus();
    }
}
async function selectSuggestion(username) {
    const loginUsername = document.getElementById('loginUsername');
    const loginSubject = document.getElementById('loginSubject');
    
    loginUsername.value = username;
    
    // Remove suggestions box (not error box)
    const suggestionsBox = document.querySelector('.login-suggestions-box');
    if (suggestionsBox) suggestionsBox.remove();
    
    // Trigger autofill for subject
    try {
        const res = await fetch(`/api/user-allowed-subject/${username}`);
        const data = await res.json();

        if (data.exists) {
            const allowed = data.allowed_subject;

            if (allowed === 'All') {
                // Admin
                loginSubject.value = '';
                loginSubject.disabled = true;
                loginSubject.parentElement.style.display = 'none';
            } else {
                // Auto-fill + lock
                loginSubject.value = allowed;
                loginSubject.disabled = true;
                loginSubject.style.cursor = 'not-allowed';
                loginSubject.style.opacity = '0.6';
                loginSubject.parentElement.style.display = 'block';
            }
        }
    } catch (err) {
        console.error('Failed to fetch allowed subject', err);
    }
    
    document.getElementById('loginPassword').focus();
}
async function initializeApp() {
    const currentUserSpan = document.getElementById('currentUser');
    if (currentUserSpan && loginState.username && loginState.selectedSubject) {
        currentUserSpan.textContent = `👤 ${loginState.username} | 📚 ${loginState.selectedSubject}`;
    }
    
    try {
        await loadCategories();
        await loadItems();
        await loadExperiments();
        
        // Set up filters after data is loaded
        setTimeout(() => {
            if (loginState.selectedSubject) {
                state.currentSubjectFilter = loginState.selectedSubject;
                if (loginState.selectedSubject === "All" || loginState.selectedSubject === "All Subjects") {
                    state.currentSubjectFilter = '';
                } else {
                    state.currentSubjectFilter = loginState.selectedSubject;
                }
                const subjectFilter = document.getElementById('subjectFilter');
                if (subjectFilter) {
                    subjectFilter.value = loginState.selectedSubject;
                    if (loginState.selectedSubject === "All" || loginState.selectedSubject === "All Subjects") {
                        subjectFilter.value = '';
                    } else {
                        subjectFilter.value = loginState.selectedSubject;
                    }
                    // Disable subject filter for non-admin users
                    if (loginState.allowedSubject !== 'All') {
                        subjectFilter.disabled = true;
                        subjectFilter.style.cursor = 'not-allowed';
                        subjectFilter.style.opacity = '0.6';
                    }
                }
                
                // Update category dropdown to show only categories for selected subject
                updateCategoryFilterDropdown();
                
                // Apply filters and render
                applyFilters();
                renderExperiments();
            }
        }, 100);
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load data: ' + error.message);
    }
}
function updateCategoryFilterDropdown() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return; // Add null check
    
    const selectedSubject = state.currentSubjectFilter;
    
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    
    let filteredCategories = state.categories;
    if (selectedSubject) {
        filteredCategories = state.categories.filter(cat => cat.subject === selectedSubject);
    }
    
    filteredCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;
        categoryFilter.appendChild(option);
    });
}
function filterBySubject() {
    if (loginState.username !== 'admin') {
        const selectedSubject = document.getElementById('subjectFilter').value;
        if (selectedSubject !== loginState.allowedSubject) {
            showError(`You can only access ${loginState.allowedSubject}`);
            const subjectFilter = document.getElementById('subjectFilter');
            if (subjectFilter) {
                subjectFilter.value = loginState.allowedSubject;
            }
            return;
        }
    }
    
    const selectedSubject = document.getElementById('subjectFilter').value;
    console.log('Subject selected:', selectedSubject);
    state.currentSubjectFilter = selectedSubject;
    
    // Update login state if user changes subject
    if (loginState.isLoggedIn) {
        loginState.selectedSubject = selectedSubject;
        
        // Update session storage
        const savedLogin = sessionStorage.getItem('labLogin');
        if (savedLogin) {
            const loginData = JSON.parse(savedLogin);
            loginData.subject = selectedSubject;
            sessionStorage.setItem('labLogin', JSON.stringify(loginData));
        }
        
        // Update the displayed subject in header
        const currentUserSpan = document.getElementById('currentUser');
        if (currentUserSpan && loginState.username) {
            const displaySubject = selectedSubject || 'All Subjects';
            currentUserSpan.textContent = `👤 ${loginState.username} | 📚 ${displaySubject}`;
        }
        
        // Show message
        if (selectedSubject) {
            showSuccess(`Switched to: ${selectedSubject}`);
        } else {
            showSuccess('Viewing: All Subjects');
        }
    }
    
    // Reset category filter when subject changes
    state.currentCategoryFilter = '';
    updateCategoryFilterDropdown();
    
    applyFilters();
    renderExperiments();
}
function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
    }
}

function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) {
        return;
    }
    
    // Clear login state FIRST to prevent recursive calls
    loginState.isLoggedIn = false;
    loginState.username = null;
    loginState.selectedSubject = null;
    loginState.allowedSubject = null;
    
    // Clear BOTH session AND local storage
    sessionStorage.removeItem('labLogin');
    localStorage.removeItem('labLogin');

    // Clear filters and state
    state.currentSubjectFilter = '';
    state.currentCategoryFilter = '';
    state.currentGradeFilter = '';
    state.selectedExperiments.clear();
    state.experiments = [];
    state.categories = [];
    state.filteredExperiments = [];
    itemsCache.length = 0;
    
    const experimentsList = document.getElementById('experiments-list');
    if (experimentsList) {
        experimentsList.innerHTML = '';
    }

    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="no-items">Select experiments to see analysis</div>';
    }

    // Call logout endpoint (don't await, just fire and forget)
    fetch('/api/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
    }).catch(err => console.log('Logout error:', err));

    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginSubject').value = '';
    
    const loginSubject = document.getElementById('loginSubject');
    loginSubject.disabled = false;
    loginSubject.style.cursor = 'pointer';
    loginSubject.style.opacity = '1';
    loginSubject.parentElement.style.display = 'block';
 
    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (rememberMeCheckbox) {
        rememberMeCheckbox.checked = false;
    }

    // Show login modal
    showLoginModal();
    document.getElementById('loginModal').classList.add('show');
}


// Replace the loadCategories function
async function loadCategories() {
    try {
        const response = await authenticatedFetch('/api/categories');
        if (!response.ok) throw new Error('Failed to load categories');
        const data = await response.json();
        state.categories = data.categories;

        // Populate subject filter dropdown
        const subjectFilter = document.getElementById('subjectFilter');
        if (subjectFilter) {
            const subjects = [...new Set(state.categories.map(cat => cat.subject))].sort();
            
            subjectFilter.innerHTML = '<option value="">All Subjects</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                subjectFilter.appendChild(option);
            });
        }

        // Populate category filter dropdown (initially all)
        updateCategoryFilterDropdown();
        
        // Populate subject dropdown in experiment modal (if it exists)
        const experimentSubject = document.getElementById('experimentSubject');
        if (experimentSubject) {
            const subjects = [...new Set(state.categories.map(cat => cat.subject))].sort();
            experimentSubject.innerHTML = '<option value="">Select Subject</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                experimentSubject.appendChild(option);
            });
        }
        
        // Populate datalist for experiment modal
        populateCategoriesDatalist();
    } catch (error) {
        console.error('Error loading categories:', error);
        if (error.message.includes('Session expired')) {
            showError('Your session has expired. Please login again.');
            // handleLogout();
        } else {
            showError('Failed to load categories: ' + error.message);
        }
    }
}

async function loadExperiments() {
    try {
        const response = await authenticatedFetch('/api/experiments');
        if (!response.ok) throw new Error('Failed to load experiments');
        
        state.experiments = await response.json();
        
        // Ensure filteredExperiments is initialized
        if (!state.filteredExperiments) {
            state.filteredExperiments = [];
        }
        
        // Apply filters (including subject filter from login)
        applyFilters();
        renderExperiments();
        calculateCosts();
    } catch (error) {
        console.error('Error loading experiments:', error);
        if (error.message.includes('Session expired')) {
            showError('Your session has expired. Please login again.');
            // handleLogout();
        } else {
            showError('Failed to load experiments: ' + error.message);
        }
    }
}

async function loadItems() {
    try {
        const response = await authenticatedFetch('/api/items');
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Session expired. Please login again.');
            }
            throw new Error('Failed to load items');
        }
        const data = await response.json();
        itemsCache.length = 0;
        itemsCache.push(...data.items);
        populateItemsDatalist();
    } catch (error) {
        console.error('Error loading items:', error);
        
        if (error.message.includes('Session expired')) {
            showError('Your session has expired. Please login again.');
            // handleLogout();
        }
    }
}

async function handleFetchError(response) {
    if (response.status === 401) {
        showError('Your session has expired. Please login again.');
        handleLogout();
        throw new Error('Session expired');
    }
    return response;
}


function populateItemsDatalist() {
    const datalist = document.getElementById('itemsList');
    if (!datalist) return;
    
    datalist.innerHTML = '';
    itemsCache.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        option.setAttribute('data-id', item.id);
        option.setAttribute('data-unit', item.unit);
        option.setAttribute('data-price', item.price_per_unit);
        option.setAttribute('data-category', item.category);
        datalist.appendChild(option);
    });
}

function filterItemsDatalist(searchText) {
    const datalist = document.getElementById('itemsList');
    if (!datalist) return;
    
    if (!searchText || searchText.length < 1) {
        populateItemsDatalist();
        return;
    }
    
    const searchLower = searchText.toLowerCase();
    
    // Separate items into "starts with" and "contains"
    const startsWithItems = [];
    const containsItems = [];
    
    itemsCache.forEach(item => {
        const nameLower = item.name.toLowerCase();
        if (nameLower.startsWith(searchLower)) {
            startsWithItems.push(item);
        } else if (nameLower.includes(searchLower)) {
            containsItems.push(item);
        }
    });
    
    // Sort each group alphabetically
    startsWithItems.sort((a, b) => a.name.localeCompare(b.name));
    containsItems.sort((a, b) => a.name.localeCompare(b.name));
    
    // Combine: starts-with first, then contains
    const sortedItems = [...startsWithItems, ...containsItems];
    
    // Populate datalist
    datalist.innerHTML = '';
    sortedItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        option.setAttribute('data-id', item.id);
        option.setAttribute('data-unit', item.unit);
        option.setAttribute('data-price', item.price_per_unit);
        option.setAttribute('data-category', item.category);
        datalist.appendChild(option);
    });
}

function populateCategoriesDatalist(subjectFilter = null) {
    const datalist = document.getElementById('categoriesList');
    if (!datalist) return;
    
    datalist.innerHTML = '';
    
    let filteredCategories = state.categories;
    if (subjectFilter) {
        filteredCategories = state.categories.filter(cat => cat.subject === subjectFilter);
    }
    
    // Sort alphabetically
    filteredCategories.sort((a, b) => a.name.localeCompare(b.name));
    
    filteredCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        datalist.appendChild(option);
    });
}

function filterCategoriesDatalist(searchText, subjectFilter = null) {
    const datalist = document.getElementById('categoriesList');
    if (!datalist) return;
    
    let filteredCategories = state.categories;
    if (subjectFilter) {
        filteredCategories = state.categories.filter(cat => cat.subject === subjectFilter);
    }
    
    if (!searchText || searchText.length < 1) {
        populateCategoriesDatalist(subjectFilter);
        return;
    }
    
    const searchLower = searchText.toLowerCase();
    
    // Separate categories into "starts with" and "contains"
    const startsWithCategories = [];
    const containsCategories = [];
    
    filteredCategories.forEach(cat => {
        const nameLower = cat.name.toLowerCase();
        if (nameLower.startsWith(searchLower)) {
            startsWithCategories.push(cat);
        } else if (nameLower.includes(searchLower)) {
            containsCategories.push(cat);
        }
    });
    
    // Sort each group alphabetically
    startsWithCategories.sort((a, b) => a.name.localeCompare(b.name));
    containsCategories.sort((a, b) => a.name.localeCompare(b.name));
    
    // Combine: starts-with first, then contains
    const sortedCategories = [...startsWithCategories, ...containsCategories];
    
    // Populate datalist
    datalist.innerHTML = '';
    sortedCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        datalist.appendChild(option);
    });
}


// ==================== FILTER FUNCTIONS ====================
// Replace applyFilters
function applyFilters() {
    // Initialize with empty array if experiments not loaded yet
    let filtered = state.experiments || [];

    // Apply subject filter
    if (state.currentSubjectFilter !== '') {
        filtered = filtered.filter(exp => {
            const expCategory = state.categories.find(cat => cat.name === exp.category);
            return expCategory && expCategory.subject === state.currentSubjectFilter;
        });
    }

    // Apply category filter
    if (state.currentCategoryFilter !== '') {
        filtered = filtered.filter(exp => {
            return exp.category === state.currentCategoryFilter;
        });
    }
    
    // Apply grade filter
    if (state.currentGradeFilter !== '') {
        const selectedGrade = parseInt(state.currentGradeFilter);
        filtered = filtered.filter(exp => {
            if (exp.grade && Array.isArray(exp.grade) && exp.grade.length > 0) {
                return exp.grade.includes(selectedGrade);
            }
            return false;
        });
    }

    state.filteredExperiments = filtered;
    
    console.log('Applied filters:', {
        subject: state.currentSubjectFilter || 'All',
        category: state.currentCategoryFilter || 'All',
        grade: state.currentGradeFilter || 'All',
        totalExperiments: state.experiments.length,
        filteredExperiments: filtered.length
    });
}

function filterByCategory() {
    const selectedCategory = document.getElementById('categoryFilter').value;
    console.log('Category selected:', selectedCategory); // Debug
    state.currentCategoryFilter = selectedCategory;
    applyFilters();
    renderExperiments();
}

function filterByGrade() {
    const selectedGrade = document.getElementById('gradeFilter').value;
    console.log('Grade selected:', selectedGrade); // Debug
    state.currentGradeFilter = selectedGrade;
    applyFilters();
    renderExperiments();
}

// Helper function to reset filters
function resetFilters() {
    // document.getElementById('subjectFilter').value = '';
    if (loginState.username === 'admin') {
        document.getElementById('subjectFilter').value = '';
        state.currentSubjectFilter = '';
    }
    document.getElementById('categoryFilter').value = '';
    document.getElementById('gradeFilter').value = '';
    // state.currentSubjectFilter = '';
    state.currentCategoryFilter = '';
    state.currentGradeFilter = '';
    updateCategoryFilterDropdown();
    applyFilters();
    renderExperiments();
}


async function deleteExperiment(expId, event) {
    event.stopPropagation(); // Prevent card selection
    if (!confirm('Are you sure you want to delete this experiment?')) return;
    
    try {
        const response = await authenticatedFetch(`/api/experiments/${expId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete experiment');
        
        state.selectedExperiments.delete(expId);
        await loadExperiments(); // Refresh after delete
        showSuccess('Experiment deleted');
    } catch (error) {
        console.error('Error deleting experiment:', error);
        showError('Failed to delete experiment: ' + error.message);
    }
}

async function copyExperiment(expId, event) {
    event.stopPropagation(); // Prevent card selection
    const exp = state.experiments.find(e => e.id === expId);
    if (!exp) {
        showError('Experiment not found');
        return;
    }
    
    const newName = prompt('Enter name for copied experiment:', exp.name + ' (Copy)');
    if (!newName || newName.trim() === '') {
        return;
    }
    if (!confirm(`Create a copy of "${exp.name}" as "${newName.trim()}"?`)) {
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/experiments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: newName.trim(),
                category: exp.category,
                trials: exp.trials,
                grade: exp.grade || [] // Copy grade field
            })
        });
        
        if (!response.ok) throw new Error('Failed to create experiment');
        
        const newExp = await response.json();
        
        for (const item of exp.items) {
            const itemData = {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                category: item.category
            };
            
            const itemResponse = await authenticatedFetch(`/api/experiments/${newExp.id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            
            if (!itemResponse.ok) throw new Error('Failed to copy item');
        }
        
        await loadExperiments(); // Refresh after copy
        showSuccess(`Experiment "${newName}" created successfully with ${exp.items.length} items`);
    } catch (error) {
        console.error('Error copying experiment:', error);
        showError('Failed to copy experiment: ' + error.message);
    }
}

async function deleteItem(expId, itemId, event) {
    event.stopPropagation(); // Prevent card selection
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
        const response = await authenticatedFetch(`/api/experiments/${expId}/items/${itemId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete item');
        
        await loadExperiments(); // Refresh after delete
        showSuccess('Item deleted');
    } catch (error) {
        console.error('Error deleting item:', error);
        showError('Failed to delete item: ' + error.message);
    }
}

async function calculateCosts() {
    if (state.selectedExperiments.size === 0) {
        renderResultsPanel(null);
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                experiment_ids: Array.from(state.selectedExperiments),
                item_usage_type: Object.fromEntries(state.itemUsageType),
                item_custom_quantity: Object.fromEntries(state.itemCustomQuantity)
            })
        });
        
        if (!response.ok) throw new Error('Failed to calculate costs');
        
        state.currentResults = await response.json();
        renderResultsPanel(state.currentResults);
    } catch (error) {
        console.error('Error calculating costs:', error);
        showError('Failed to calculate costs: ' + error.message);
    }
}

// Add these functions to your script.js

// ==================== PREVIEW & EXPORT FUNCTIONS ====================

function showPreviewModal() {
    if (state.selectedExperiments.size === 0) {
        showError('Please select at least one experiment');
        return;
    }
    
    if (!state.currentResults) {
        showError('No analysis results available');
        return;
    }
    
    renderPreviewModal();
    showModal('previewModal');
}

function renderPreviewModal() {
    const results = state.currentResults;
    const previewContent = document.getElementById('previewContent');
    
    let html = '<div style="padding: 20px;">';
    
    // Summary
    html += `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0;">📊 Summary</h3>
            <div style="font-size: 1.2em;">
                <strong>${results.selected_count}</strong> Experiments Selected<br>
                <strong>Total Cost: ₹${results.total_cost.toFixed(2)}</strong>
            </div>
        </div>
    `;
    
    // Get selected experiments
    const selectedExps = Array.from(state.selectedExperiments)
        .map(id => state.experiments.find(e => e.id === id))
        .filter(e => e);
    
    // For each experiment
    selectedExps.forEach(exp => {
        html += `
            <div style="margin-bottom: 30px; border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <div style="background: #f3f4f6; padding: 15px; border-bottom: 2px solid #e5e7eb;">
                    <h4 style="margin: 0; color: #1f2937;">${escapeHtml(exp.name)}</h4>
                    <div style="font-size: 0.9em; color: #6b7280; margin-top: 5px;">
                        ${exp.id} • ${exp.category} • ${exp.trials} trial(s)
                    </div>
                </div>
                <div style="padding: 15px;">
                    <h5 style="margin: 0 0 10px 0; color: #374151;">Items:</h5>
        `;
        
        // Unique items for this experiment
        const uniqueItemsForExp = results.unique_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
        uniqueItemsForExp.forEach(item => {
            const expData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';
            const isPacking = item.category === 'packing';
            
            let qty;
            if (isEquipment) {
                qty = expData.quantity;
            } else if (isPacking) {
                qty = expData.quantity * expData.trials;
            } else {
                qty = expData.quantity * expData.trials;
            }
            
            const cost = qty * item.price;
            
            let categoryLabel = '';
            if (isEquipment) categoryLabel = ' - Equipment';
            if (isPacking) categoryLabel = ' - Packing';
            
            html += `
                <div style="background: #fff3e0; padding: 10px; margin-bottom: 8px; border-radius: 6px; 
                            border-left: 4px solid #ff9800;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: #e65100;">⭐ ${escapeHtml(item.name)}</strong>
                            <span style="color: #666; font-size: 0.9em; margin-left: 10px;">
                                (Unique${categoryLabel})
                            </span>
                        </div>
                        <div style="text-align: right;">
                            <div>${qty} ${item.unit}</div>
                            <div style="font-weight: 600; color: #e65100;">₹${cost.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Common items used in this experiment
        const commonItemsForExp = results.common_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
        commonItemsForExp.forEach(item => {
            const expData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';
            const isPacking = item.category === 'packing';
            
            let qty;
            if (isEquipment) {
                qty = expData.quantity;
            } else if (isPacking) {
                qty = expData.quantity * expData.trials;
            } else {
                qty = expData.quantity * expData.trials;
            }
            
            let categoryLabel = '';
            if (isEquipment) categoryLabel = ' - Equipment';
            if (isPacking) categoryLabel = ' - Packing';
            
            html += `
                <div style="background: #f1f8f5; padding: 10px; margin-bottom: 8px; border-radius: 6px; 
                            border-left: 4px solid #4CAF50;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: #2e7d32;">🔗 ${escapeHtml(item.name)}</strong>
                            <span style="color: #666; font-size: 0.9em; margin-left: 10px;">
                                (Common - Shared${categoryLabel})
                            </span>
                        </div>
                        <div style="text-align: right;">
                            <div>${qty} ${item.unit} needed</div>
                        </div>
                    </div>
                </div>
            `;
        });

        
        html += `
                </div>
            </div>
        `;
    });
    
    // Common Items Summary
    if (results.common_items.length > 0) {
        html += `
            <div style="margin-top: 30px; border: 2px solid #4CAF50; border-radius: 8px; overflow: hidden;">
                <div style="background: #4CAF50; color: white; padding: 15px;">
                    <h4 style="margin: 0;">🔗 Common Items to Procure</h4>
                </div>
                <div style="padding: 15px;">
        `;
        
        results.common_items.forEach(item => {
            const customQty = state.itemCustomQuantity.get(item.name);
            const displayQty = customQty !== undefined ? customQty : item.total_quantity;
            const cost = displayQty * item.price;
            
            html += `
                <div style="background: #f1f8f5; padding: 12px; margin-bottom: 10px; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: #2e7d32;">${escapeHtml(item.name)}</strong>
                            <div style="font-size: 0.85em; color: #666; margin-top: 4px;">
                                Used in ${item.experiments.length} experiment(s)
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.9em; color: #666;">Procure: ${displayQty} ${item.unit}</div>
                            <div style="font-weight: 600; color: #2e7d32; font-size: 1.1em;">₹${cost.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    previewContent.innerHTML = html;
}

function savePreviewData() {
    if (!state.currentResults) {
        showError('No data to save');
        return;
    }
    
    // Build JSON structure
    const exportData = {
        summary: {
            total_experiments: state.currentResults.selected_count,
            total_cost: state.currentResults.total_cost,
            generated_date: new Date().toISOString()
        },
        experiments: []
    };
    
    // Get selected experiments
    const selectedExps = Array.from(state.selectedExperiments)
        .map(id => state.experiments.find(e => e.id === id))
        .filter(e => e);
    
    // For each experiment
    selectedExps.forEach(exp => {
        const expData = {
            id: exp.id,
            name: exp.name,
            category: exp.category,
            trials: exp.trials,
            grade: exp.grade,
            unique_items: [],
            common_items_used: []
        };
        
        // Unique items for this experiment
        const uniqueItemsForExp = state.currentResults.unique_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
       uniqueItemsForExp.forEach(item => {
            const expItemData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';
            const isPacking = item.category === 'packing';

            let qty;
            if (isEquipment) {
                qty = expItemData.quantity;
            } else if (isPacking) {
                qty = expItemData.quantity * expItemData.trials;
            } else {
                qty = expItemData.quantity * expItemData.trials;
            }
            const cost = qty * item.price;
            expData.unique_items.push({
                name: item.name,
                quantity: qty,
                unit: item.unit,
                price_per_unit: item.price,
                total_cost: cost,
                category: item.category
            });
        });
        
        // Common items used in this experiment
        const commonItemsForExp = state.currentResults.common_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
        commonItemsForExp.forEach(item => {
            const expItemData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';
            const isPacking = item.category === 'packing';

            let qty;
            if (isEquipment) {
                qty = expItemData.quantity;
            } else if (isPacking) {
                qty = expItemData.quantity * expItemData.trials;
            } else {
                qty = expItemData.quantity * expItemData.trials;
            }
            const cost = qty * item.price;
            
            expData.common_items_used.push({
                name: item.name,
                quantity_needed: qty,
                unit: item.unit
            });
        });
        
        exportData.experiments.push(expData);
    });
    
    // Common items list
    exportData.common_items_to_procure = state.currentResults.common_items.map(item => {
        const customQty = state.itemCustomQuantity.get(item.name);
        const displayQty = customQty !== undefined ? customQty : item.total_quantity;
        const cost = displayQty * item.price;
        
        return {
            name: item.name,
            total_quantity: displayQty,
            unit: item.unit,
            price_per_unit: item.price,
            total_cost: cost,
            category: item.category,
            used_in_experiments: item.experiments.map(e => e.exp_name)
        };
    });
    
    // Download JSON
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lab_procurement_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    showSuccess('JSON file downloaded successfully');
    closeModal('previewModal');
}

// Complete exportToExcel function - Add to your script.js

function exportToExcel() {
    if (!state.currentResults) {
        showError('No data to export');
        return;
    }
    
    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
        showError('Excel library not loaded. Please refresh the page.');
        return;
    }
    
    // Create a new workbook
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Summary
    const summaryData = [
        ['Lab Procurement Report'],
        ['Generated:', new Date().toLocaleDateString()],
        ['Total Experiments:', state.currentResults.selected_count],
        ['Total Cost (₹):', state.currentResults.total_cost],
        []
    ];
    const ws_summary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws_summary, 'Summary');
    
    // Get selected experiments
    const selectedExps = Array.from(state.selectedExperiments)
        .map(id => state.experiments.find(e => e.id === id))
        .filter(e => e);
    
    // Sheet 2: Experiments with Items (per experiment breakdown)
    const expData = [['Experiment ID', 'Experiment Name', 'Category', 'Trials', 'Item Name', 'Type', 'Quantity', 'Unit', 'Price/Unit (₹)', 'Total Cost (₹)']];
    
    selectedExps.forEach(exp => {
        // Unique items for this experiment
        const uniqueItemsForExp = state.currentResults.unique_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
        uniqueItemsForExp.forEach(item => {
            const expItemData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';
            const isPacking = item.category === 'packing';

            let qty;
            if (isEquipment) {
                qty = expItemData.quantity;
            } else if (isPacking) {
                qty = expItemData.quantity * expItemData.trials;
            } else {
                qty = expItemData.quantity * expItemData.trials;
            }
            const cost = qty * item.price
            expData.push([
                exp.id,
                exp.name,
                exp.category,
                exp.trials,
                item.name,
                'Unique',
                qty,
                item.unit,
                item.price,
                cost
            ]);
        });
        
        // Common items used in this experiment
        const commonItemsForExp = state.currentResults.common_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
        commonItemsForExp.forEach(item => {
            const expItemData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';
            const isPacking = item.category === 'packing';

            let qty;
            if (isEquipment) {
                qty = expItemData.quantity;
            } else if (isPacking) {
                qty = expItemData.quantity * expItemData.trials;
            } else {
                qty = expItemData.quantity * expItemData.trials;
            }
            const cost = qty * item.price;
            
            expData.push([
                exp.id,
                exp.name,
                exp.category,
                exp.trials,
                item.name,
                'Common',
                qty,
                item.unit,
                item.price,
                '(See Common Items sheet)'
            ]);
        });
        
        // Add empty row between experiments
        expData.push(['', '', '', '', '', '', '', '', '', '']);
    });
    
    const ws_exp = XLSX.utils.aoa_to_sheet(expData);
    
    // Set column widths
    ws_exp['!cols'] = [
        { wch: 12 }, // Experiment ID
        { wch: 30 }, // Experiment Name
        { wch: 20 }, // Category
        { wch: 8 },  // Trials
        { wch: 40 }, // Item Name
        { wch: 10 }, // Type
        { wch: 10 }, // Quantity
        { wch: 8 },  // Unit
        { wch: 12 }, // Price/Unit
        { wch: 15 }  // Total Cost
    ];
    
    XLSX.utils.book_append_sheet(wb, ws_exp, 'Experiments & Items');
    
    // Sheet 3: Common Items to Procure
    const commonData = [
        ['Common Items to Procure'],
        ['Item Name', 'Total Quantity', 'Unit', 'Price/Unit (₹)', 'Total Cost (₹)', 'Category', 'Used In Experiments']
    ];
    
    state.currentResults.common_items.forEach(item => {
        const customQty = state.itemCustomQuantity.get(item.id);
        const displayQty = customQty !== undefined ? customQty : item.total_quantity;
        const cost = displayQty * item.price;
        const usedIn = item.experiments.map(e => e.exp_name).join(', ');
        
        commonData.push([
            item.name,
            displayQty,
            item.unit,
            item.price,
            cost,
            item.category === 'consumable' ? 'Consumable' : 'Equipment',
            usedIn
        ]);
    });
    
    // Add total row
    const totalCommonCost = state.currentResults.common_items.reduce((sum, item) => {
        const customQty = state.itemCustomQuantity.get(item.id);
        const displayQty = customQty !== undefined ? customQty : item.total_quantity;
        return sum + (displayQty * item.price);
    }, 0);
    
    commonData.push(['', '', '', 'TOTAL:', totalCommonCost, '', '']);
    
    const ws_common = XLSX.utils.aoa_to_sheet(commonData);
    
    // Set column widths for common items sheet
    ws_common['!cols'] = [
        { wch: 40 }, // Item Name
        { wch: 15 }, // Total Quantity
        { wch: 8 },  // Unit
        { wch: 12 }, // Price/Unit
        { wch: 15 }, // Total Cost
        { wch: 15 }, // Category
        { wch: 50 }  // Used In Experiments
    ];
    
    XLSX.utils.book_append_sheet(wb, ws_common, 'Common Items');
    
    // Sheet 4: Unique Items Summary
    const uniqueData = [
        ['Unique Items Summary'],
        ['Experiment', 'Item Name', 'Quantity', 'Unit', 'Price/Unit (₹)', 'Total Cost (₹)', 'Category']
    ];
    
    selectedExps.forEach(exp => {
        const uniqueItemsForExp = state.currentResults.unique_items.filter(item => 
            item.experiments.some(e => e.exp_name === exp.name)
        );
        
        uniqueItemsForExp.forEach(item => {
            const expItemData = item.experiments.find(e => e.exp_name === exp.name);
            const isEquipment = item.category === 'non_consumable';  // ✅ ADD THIS
            const qty = isEquipment ? expItemData.quantity : (expItemData.quantity * expItemData.trials);  // ✅ FIX THIS
            const cost = qty * item.price;
            
            uniqueData.push([
                exp.name,
                item.name,
                qty,
                item.unit,
                item.price,
                cost,
                item.category === 'consumable' ? 'Consumable' : 'Equipment'
            ]);
        });
        
        // Add empty row between experiments
        uniqueData.push(['', '', '', '', '', '', '']);
    });
    
    // Add total row
    const totalUniqueCost = state.currentResults.unique_items.reduce((sum, item) => {
        return sum + item.total_cost;
    }, 0);
    
    uniqueData.push(['', '', '', '', 'TOTAL:', totalUniqueCost, '']);
    
    const ws_unique = XLSX.utils.aoa_to_sheet(uniqueData);
    
    // Set column widths for unique items sheet
    ws_unique['!cols'] = [
        { wch: 30 }, // Experiment
        { wch: 40 }, // Item Name
        { wch: 10 }, // Quantity
        { wch: 8 },  // Unit
        { wch: 12 }, // Price/Unit
        { wch: 15 }, // Total Cost
        { wch: 15 }  // Category
    ];
    
    XLSX.utils.book_append_sheet(wb, ws_unique, 'Unique Items');
    
    // Sheet 5: Procurement Summary
    const procurementData = [
        ['PROCUREMENT SUMMARY'],
        [''],
        ['Total Experiments:', state.currentResults.selected_count],
        [''],
        ['Common Items Cost:', totalCommonCost.toFixed(2)],
        ['Unique Items Cost:', totalUniqueCost.toFixed(2)],
        ['GRAND TOTAL:', state.currentResults.total_cost.toFixed(2)],
        [''],
        [''],
        ['Breakdown by Category'],
        ['Type', 'Count', 'Total Cost (₹)']
    ];
    
    // Calculate breakdown
    const commonItemsCount = state.currentResults.common_items.length;
    const uniqueItemsCount = state.currentResults.unique_items.length;
    
    procurementData.push(['Common Items', commonItemsCount, totalCommonCost.toFixed(2)]);
    procurementData.push(['Unique Items', uniqueItemsCount, totalUniqueCost.toFixed(2)]);
    procurementData.push(['TOTAL', commonItemsCount + uniqueItemsCount, state.currentResults.total_cost.toFixed(2)]);
    
    const ws_procurement = XLSX.utils.aoa_to_sheet(procurementData);
    
    // Set column widths for procurement summary
    ws_procurement['!cols'] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 20 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws_procurement, 'Procurement Summary');
    
    // Save the file
    const fileName = `lab_procurement_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showSuccess('Excel file downloaded successfully');
}

// ==================== RENDERING ====================

function toggleExpanded(expId, event) {
    event.stopPropagation(); // Prevent card selection
    
    if (state.expandedExperiments.has(expId)) {
        state.expandedExperiments.delete(expId);
    } else {
        state.expandedExperiments.add(expId);
    }
    renderExperiments();
}

function truncateText(text, maxLength = 35) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Replace the renderExperiments function
function renderExperiments() {
    const container = document.getElementById('experiments-list');
    
    // Add null check
    if (!container) {
        console.warn('Experiments list container not found');
        return;
    }
    
    if (state.filteredExperiments.length === 0) {
        container.innerHTML = '<div class="no-items">No experiments found. Click "Add Experiment" to create one.</div>';
        return;
    }
    
    container.innerHTML = state.filteredExperiments.map(exp => {
        const isSelected = state.selectedExperiments.has(exp.id);
        const isExpanded = state.expandedExperiments.has(exp.id);
        
        // Format grade display
        const gradeDisplay = exp.grade && Array.isArray(exp.grade) && exp.grade.length > 0
            ? `Grade ${exp.grade.join(', ')}`
            : 'No Grade';
        
        return `
            <div class="experiment-card ${isSelected ? 'selected' : ''}" onclick="toggleExperiment('${exp.id}')">
                <div class="experiment-header">
                    <input type="checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="toggleExperiment('${exp.id}')"
                           class="experiment-checkbox"
                           onclick="event.stopPropagation();">
                    
                    <div class="experiment-info">
                        <div class="experiment-name-display" title="${escapeHtml(exp.name)}">${truncateText(exp.name)}</div>
                        <div class="experiment-id">${exp.id} • ${escapeHtml(exp.category || 'N/A')}</div>
                        <div class="experiment-id">${exp.items.length} items • ${exp.trials || 1} trial(s)</div> 
                        <div class="experiment-id">${gradeDisplay}</div>
                    </div>
                    
                    <div class="experiment-actions">

                        <button class="icon-btn"
                            title="View"
                            onclick="toggleExpanded('${exp.id}', event)">
                            <i class="bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}"></i>
                        </button>

                        <button class="icon-btn copy"
                            title="Copy"
                            onclick="copyExperiment('${exp.id}', event)">
                            <i class="bi bi-copy"></i>
                        </button>

                        <button class="icon-btn edit"
                            title="Edit"
                            onclick="editExperiment('${exp.id}', event)">
                            <i class="bi bi-pencil"></i>
                        </button>

                        <button class="icon-btn delete"
                            title="Delete"
                            onclick="deleteExperiment('${exp.id}', event)">
                            <i class="bi bi-trash"></i>
                        </button>
                        
                    </div>
                </div>
                
                ${isExpanded ? renderItemsTable(exp) : ''}
            </div>
        `;
    }).join('');
}

function renderItemsTable(exp) {
    return `
        <div class="items-expanded">
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item Name</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Price (₹)</th>
                        <th>Category</th>
                    </tr>
                </thead>
                <tbody>
                    ${exp.items.map(item => `
                        <tr>
                            <td>${escapeHtml(item.name)}</td>
                            <td>${item.quantity}</td>
                            <td>${item.unit}</td>
                            <td>₹${item.price.toFixed(2)}</td>
                            <td>${item.category === 'consumable' ? 'Consumable' : item.category === 'packing' ? 'Packing Material' : 'Equipment'}</td>
                            
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <button class="btn btn-add-item" onclick="showAddItemModal('${exp.id}', event)">+ Add Item</button>
        </div>
    `;
}

function renderResultsPanel(results) {
    const container = document.getElementById('results-container');
    
    if (!results) {
        container.innerHTML = '<div class="no-items">Select experiments to see analysis</div>';
        return;
    }
    
    let html = `
        <div class="summary-box">
            <span class="summary-label">Experiments Selected: </span>
            <span class="summary-value">${results.selected_count}</span>

            <span class="total-cost-highlight">Total: ₹${results.total_cost.toFixed(2)}</span>
        </div>
    `;
    
    // Common Items Section
    if (results.common_items.length > 0) {
        html += `<div class="items-section">
            <h3>🔗 Common Items (${results.common_items.length})</h3>
            ${results.common_items.map(item => renderCommonItemCard(item)).join('')}
        </div>`;
    }
    
    // Unique Items Section
    if (results.unique_items.length > 0) {
        html += `<div class="items-section">
            <h3>⭐ Unique Items (${results.unique_items.length})</h3>
            ${results.unique_items.map(item => renderUniqueItemCard(item)).join('')}
        </div>`;
    }
    
    container.innerHTML = html;
}
function renderCommonItemCard(item) {
    const isEquipment = item.category === 'non_consumable';
    const isPacking = item.category === 'packing';
    
    // Build experiments usage display with correct quantities
    const experiments = item.experiments.map(e => {
        let qty, trialText;
        
        if (isEquipment) {
            qty = e.quantity;
            trialText = '(Equipment - counted once)';
        } else if (isPacking) {
            qty = e.quantity * e.trials;
            trialText = `x ${e.trials} trial(s) = ${qty} ${item.unit}`;
        } else {
            qty = e.quantity * e.trials;
            trialText = `x ${e.trials} trial(s) = ${qty} ${item.unit}`;
        }
        
        return `<div class="experiment-usage">• ${escapeHtml(e.exp_name)}: ${e.quantity} ${item.unit} ${trialText}</div>`;
    }).join('');
    
    // Calculate required quantity correctly
    let requiredQty;
    if (isEquipment) {
        // Equipment: max quantity across all experiments (counted once)
        requiredQty = Math.max(...item.experiments.map(e => e.quantity));
    } else if (isPacking) {
        // Packing: sum of (quantity * trials) for each experiment
        requiredQty = item.experiments.reduce((sum, e) => sum + (e.quantity * e.trials), 0);
    } else {
        // Consumable: sum of (quantity * trials) for each experiment
        requiredQty = item.experiments.reduce((sum, e) => sum + (e.quantity * e.trials), 0);
    }
    
    const customQty = state.itemCustomQuantity.get(item.id);
    const displayQty = customQty !== undefined ? customQty : requiredQty;
    const displayCost = displayQty * item.price;
    
    const isCustom = customQty !== undefined;
    
    // Category display
    let categoryDisplay = 'Consumable';
    if (item.category === 'non_consumable') categoryDisplay = 'Equipment';
    if (item.category === 'packing') categoryDisplay = 'Packing Material';
    
    return `
        <div class="item-card common-item">
            <div class="item-card-name">${escapeHtml(item.name)}</div>
            <div class="item-card-detail">${categoryDisplay}</div>
            <div class="item-card-detail">Required: ${requiredQty} ${item.unit} @ ₹${item.price}/unit</div>
            
            <div class="item-card-experiments">
                <strong>Used in:</strong>
                ${experiments}
            </div>
            
            <div class="quantity-editor">
                <label for="qty_${item.id}">Procure Quantity:</label>
                <input type="number" 
                       id="qty_${item.id}" 
                       value="${displayQty}" 
                       min="0" 
                       step="0.1"
                       onchange="updateCustomQuantity('${item.id}', this.value)"
                       style="${isCustom ? 'border-color: #4CAF50; background: #f1f8f5;' : ''}">
                <span>${item.unit}</span>
            </div>
            
            ${displayQty > requiredQty ? `
                <div style="font-size: 0.85em; color: #4CAF50; margin: 5px 0; font-weight: 600;">
                    ✓ Buying extra: ${(displayQty - requiredQty).toFixed(2)} ${item.unit}
                </div>
            ` : displayQty < requiredQty ? `
                <div style="font-size: 0.85em; color: #f59e0b; margin: 5px 0; font-weight: 600;">
                    ⚠ Warning: Less than required (${requiredQty} ${item.unit})
                </div>
            ` : ''}
            
            <div class="item-card-detail">
                <strong>Cost: ₹${displayCost.toFixed(2)}</strong>
                ${isCustom ? `<span style="color: #666; font-size: 0.9em;"> (Min cost: ₹${(requiredQty * item.price).toFixed(2)})</span>` : ''}
            </div>
            
            <button class="mark-unique-btn" onclick="markAsUnique('${item.id}')">Mark as Unique</button>
        </div>
    `;
}
function renderUniqueItemCard(item) {
    const isEquipment = item.category === 'non_consumable';
    const isPacking = item.category === 'packing';
    
    // Build experiments usage display with correct quantities
    const experiments = item.experiments.map(e => {
        let qty, trialText;
        
        if (isEquipment) {
            qty = e.quantity;
            trialText = '(Equipment - counted once)';
        } else if (isPacking) {
            qty = e.quantity * e.trials;
            trialText = `x ${e.trials} trial(s) = ${qty} ${item.unit}`;
        } else {
            qty = e.quantity * e.trials;
            trialText = `x ${e.trials} trial(s) = ${qty} ${item.unit}`;
        }
        
        return `<div class="experiment-usage">• ${escapeHtml(e.exp_name)}: ${e.quantity} ${item.unit} ${trialText}</div>`;
    }).join('');
    
    // Calculate total quantity correctly
    let totalQty;
    if (isEquipment) {
        // Equipment: just the quantity (counted once per experiment, sum across all)
        totalQty = item.experiments.reduce((sum, e) => sum + e.quantity, 0);
    } else if (isPacking) {
        // Packing: sum of (quantity * trials) for each experiment
        totalQty = item.experiments.reduce((sum, e) => sum + (e.quantity * e.trials), 0);
    } else {
        // Consumable: sum of (quantity * trials) for each experiment
        totalQty = item.experiments.reduce((sum, e) => sum + (e.quantity * e.trials), 0);
    }
    
    const totalCost = totalQty * item.price;
    
    const hasMultipleExps = item.experiments.length > 1;
    
    // Category display
    let categoryDisplay = 'Consumable';
    if (item.category === 'non_consumable') categoryDisplay = 'Equipment';
    if (item.category === 'packing') categoryDisplay = 'Packing Material';
    
    return `
        <div class="item-card unique-item">
            <div class="item-card-name">${escapeHtml(item.name)}</div>
            <div class="item-card-detail">${categoryDisplay}</div>
            <div class="item-card-detail">Total: ${totalQty} ${item.unit} @ ₹${item.price}/unit</div>
            
            <div class="item-card-experiments">
                <strong>Used in:</strong>
                ${experiments}
            </div>
            
            <div class="item-card-detail"><strong>Cost: ₹${totalCost.toFixed(2)}</strong></div>
            
            ${hasMultipleExps ? `
                <button class="mark-common-btn" onclick="markAsCommon('${item.id}')">Mark as Common</button>
            ` : ''}
        </div>
    `;
}

// ==================== EVENT HANDLERS ====================

function toggleExperiment(expId) {
    if (state.selectedExperiments.has(expId)) {
        state.selectedExperiments.delete(expId);
    } else {
        state.selectedExperiments.add(expId);
    }
    renderExperiments();
    calculateCosts();
}

function updateCustomQuantity(itemId, value) {
    console.log('Updating quantity for:', itemId, 'to:', value); // Debug
    const qty = parseFloat(value);
    
    // Allow any positive number including 0
    if (!isNaN(qty) && qty >= 0) {
        const commonItem = state.currentResults?.common_items.find(item => item.id === itemId);
        
        if (commonItem) {
            const requiredQty = commonItem.required_quantity || commonItem.total_quantity;
            
            // Always set custom quantity regardless of whether it's more or less than required
            if (qty !== requiredQty) {
                state.itemCustomQuantity.set(itemId, qty);
            } else {
                // If it equals required, remove custom quantity (use default)
                state.itemCustomQuantity.delete(itemId);
            }
        } else {
            state.itemCustomQuantity.set(itemId, qty);
        }
        
        calculateCosts();
    } else {
        // If invalid input, show error
        console.error('Invalid quantity:', value);
    }
}

function markAsUnique(itemId) {
    console.log('Marking as unique:', itemId); // Debug
    state.itemUsageType.set(itemId, 'unique');
    state.itemCustomQuantity.delete(itemId);
    calculateCosts();
}

function markAsCommon(itemId) {
    console.log('Marking as common:', itemId); // Debug
    state.itemUsageType.set(itemId, 'common');
    calculateCosts();
}
// ==================== MODAL ITEM MANAGEMENT ====================
function handleItemSelection() {
    const itemNameInput = document.getElementById('itemName');
    const itemName = itemNameInput.value.trim();
    
    if (!itemName) return;
    
    // Check if item exists in cache
    const existingItem = itemsCache.find(item => 
        item.name.toLowerCase() === itemName.toLowerCase()
    );
    
    if (existingItem) {
        // Auto-fill fields from existing item
        document.getElementById('itemUnit').value = existingItem.unit;
        document.getElementById('itemPrice').value = existingItem.price_per_unit;
        document.getElementById('itemCategory').value = existingItem.category;
        
        // Make fields readonly to indicate they're loaded from existing item
        document.getElementById('itemUnit').setAttribute('readonly', 'true');
        document.getElementById('itemPrice').setAttribute('readonly', 'true');
        document.getElementById('itemCategory').setAttribute('readonly', 'true');
    } else {
        // New item - clear readonly if set
        document.getElementById('itemUnit').removeAttribute('readonly');
        document.getElementById('itemPrice').removeAttribute('readonly');
        document.getElementById('itemCategory').removeAttribute('readonly');
    }
}


function renderModalItems() {
    const container = document.getElementById('modalItemsList');
    const table = document.getElementById('modalItemsTable');
    const tbody = document.getElementById('modalItemsTableBody');
    
    if (state.modalItems.length === 0) {
        container.innerHTML = '<div class="no-items">No items added yet</div>';
        table.style.display = 'none';
        return;
    }
    
    container.innerHTML = '';
    table.style.display = 'table';
    
    tbody.innerHTML = state.modalItems.map((item, idx) => `
        <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${item.quantity}</td>
            <td>${item.unit}</td>
            <td>₹${item.price.toFixed(2)}</td>
            <td>${item.category === 'consumable' ? 'Consumable' : item.category === 'packing' ? 'Packing Material' : 'Equipment'}</td>
            <td>
                <div class="item-actions">
                    <button class="icon-btn edit"
                        title="Edit"
                        onclick="editModalItem(${idx})">
                        <i class="bi bi-pencil"></i>
                    </button>

                    <button class="icon-btn delete"
                        title="Delete"
                        onclick="deleteModalItem(${idx})">
                        <i class="bi bi-trash"></i>
                    </button>
                    
                </div>
            </td>
        </tr>
    `).join('');
}

function addItemToModal() {
    const tempId = `ITM_TEMP_${Date.now()}`;
    
    const newItem = {
        id: tempId,
        name: '',
        quantity: 1,
        unit: 'ml',
        price: 0,
        category: 'consumable'
    };
    
    state.modalItems.push(newItem);
    state.modalEditingItemIndex = state.modalItems.length - 1;
    openModalItemDialog(state.modalItems.length - 1);
}

function editModalItem(index) {
    state.modalEditingItemIndex = index;
    openModalItemDialog(index);
}

function deleteModalItem(index) {
    if (confirm('Delete this item?')) {
        state.modalItems.splice(index, 1);
        renderModalItems();
    }
}

function openModalItemDialog(index) {
    const item = state.modalItems[index];
    
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemUnit').value = item.unit;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemCategory').value = item.category;
    
    document.getElementById('itemModalTitle').textContent = item.name ? 'Edit Item' : 'Add Item';
    
    // Reset datalist filter
    filterItemsDatalist(item.name || '');
    
    showModal('itemModal');
}
function saveModalItem() {
    const itemData = {
        name: document.getElementById('itemName').value.trim(),
        quantity: parseFloat(document.getElementById('itemQuantity').value) || 0,
        unit: document.getElementById('itemUnit').value,
        price: parseFloat(document.getElementById('itemPrice').value) || 0,
        category: document.getElementById('itemCategory').value
    };
    
    if (!itemData.name) {
        alert('Please enter an item name');
        return;
    }
    
    if (itemData.quantity <= 0) {
        alert('Quantity must be greater than 0');
        return;
    }
    
    if (itemData.price <= 0) {
        alert('Price cannot be negative or zero');
        return;
    }
    
    // Check for duplicate item (by name, case-insensitive)
    const index = state.modalEditingItemIndex;
    const isDuplicate = state.modalItems.some((item, idx) => {
        // Skip the current item if we're editing
        if (idx === index) return false;
        return item.name.toLowerCase() === itemData.name.toLowerCase();
    });
    
    if (isDuplicate) {
        alert(`Item "${itemData.name}" is already added to this experiment. Please choose a different item or edit the existing one.`);
        return;
    }

    const currentItem = state.modalItems[index];
    const isEditing = currentItem?.name ? true : false;
    
    // Build detailed message
    let message = isEditing ? 'Save changes to item?\n\n' : 'Add new item?\n\n';
    message += `Name: ${itemData.name}\n`;
    message += `Quantity: ${itemData.quantity} ${itemData.unit}\n`;
    message += `Price: ₹${itemData.price}/${itemData.unit}\n`;
    message += `Category: ${itemData.category === 'consumable' ? 'Consumable' : itemData.category === 'packing' ? 'Packing Material' : 'Equipment'}`;
    
    // Show changes if editing
    if (isEditing) {
        let changes = '\n\nChanges:';
        let hasChanges = false;
        
        if (currentItem.name !== itemData.name) {
            changes += `\n• Name: "${currentItem.name}" → "${itemData.name}"`;
            hasChanges = true;
        }
        if (currentItem.quantity !== itemData.quantity) {
            changes += `\n• Quantity: ${currentItem.quantity} → ${itemData.quantity}`;
            hasChanges = true;
        }
        if (currentItem.unit !== itemData.unit) {
            changes += `\n• Unit: ${currentItem.unit} → ${itemData.unit}`;
            hasChanges = true;
        }
        if (currentItem.price !== itemData.price) {
            changes += `\n• Price: ₹${currentItem.price} → ₹${itemData.price}`;
            hasChanges = true;
        }
        if (currentItem.category !== itemData.category) {
            const oldCat = currentItem.category === 'consumable' ? 'Consumable' : currentItem.category === 'packing' ? 'Packing Material' : 'Equipment';
            const newCat = itemData.category === 'consumable' ? 'Consumable' : itemData.category === 'packing' ? 'Packing Material' : 'Equipment';
            changes += `\n• Category: ${oldCat} → ${newCat}`;
            hasChanges = true;
        }
        
        if (!hasChanges) {
            alert('No changes detected');
            return;
        }
        
        message += changes;
    }

    if (!confirm(message)) {
        return;
    }
    
    const idx = state.modalEditingItemIndex;
    state.modalItems[idx] = {
        ...state.modalItems[idx],
        ...itemData
    };
    
    state.modalEditingItemIndex = null;
    renderModalItems();
    closeModal('itemModal');
}

async function createExperimentWithItems(name, category, trials, grade) {
    try {
        const response = await authenticatedFetch('/api/experiments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, trials, grade })
        });
        
        if (!response.ok) throw new Error('Failed to create experiment');
        
        const newExp = await response.json();
        
        for (const item of state.modalItems) {
            const itemData = {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                category: item.category
            };
            
            const itemResponse = await authenticatedFetch(`/api/experiments/${newExp.id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(itemData)
            });
            
            if (!itemResponse.ok) throw new Error('Failed to add item');
        }
        
        await loadExperiments(); // Refresh after create
        showSuccess(`Experiment "${name}" created with ${state.modalItems.length} items (${trials} trials)`);
    } catch (error) {
        console.error('Error creating experiment with items:', error);
        showError('Failed to create experiment: ' + error.message);
    }
}

async function updateExperimentWithItems(expId, name, category, trials, grade) {
    try {
        await authenticatedFetch(`/api/experiments/${expId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, category, trials, grade })
        });
        
        const exp = state.experiments.find(e => e.id === expId);
        const oldItems = exp.items;
        
        for (const oldItem of oldItems) {
            const stillExists = state.modalItems.find(i => i.id === oldItem.id);
            if (!stillExists) {
                await authenticatedFetch(`/api/experiments/${expId}/items/${oldItem.id}`, {
                    method: 'DELETE'
                });
            }
        }
        
        for (const item of state.modalItems) {
            if (item.id.startsWith('ITM_TEMP_')) {
                const itemData = {
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    price: item.price,
                    category: item.category
                };
                
                await authenticatedFetch(`/api/experiments/${expId}/items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemData)
                });
            } else {
                const itemData = {
                    name: item.name,
                    quantity: item.quantity,
                    unit: item.unit,
                    price: item.price,
                    category: item.category
                };
                
                await authenticatedFetch(`/api/experiments/${expId}/items/${item.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(itemData)
                });
            }
        }
        
        await loadExperiments(); // Refresh after update
        showSuccess('Experiment updated successfully');
    } catch (error) {
        console.error('Error updating experiment with items:', error);
        showError('Failed to update experiment: ' + error.message);
    }
}

// ==================== MODAL HANDLING ====================

function updateCategoryDropdown() {
    const selectedSubject = document.getElementById('experimentSubject').value;
    const categoryInput = document.getElementById('experimentCategory');
    
    if (!selectedSubject) {
        categoryInput.value = '';
        categoryInput.setAttribute('placeholder', 'Please select a subject first');
        categoryInput.setAttribute('disabled', 'true');
        categoryInput.style.cursor = 'not-allowed';
        categoryInput.style.opacity = '0.6';
        populateCategoriesDatalist('');
    } else {
        categoryInput.removeAttribute('disabled');
        categoryInput.setAttribute('placeholder', 'Search or type new category');
        categoryInput.style.cursor = 'text';
        categoryInput.style.opacity = '1';
        populateCategoriesDatalist(selectedSubject);
        
        // **FIXED: Re-attach input listener for filtering when subject changes**
        const newListener = (e) => {
            filterCategoriesDatalist(e.target.value, selectedSubject);
        };
        
        // Remove old listener if exists
        categoryInput.removeEventListener('input', categoryInput._filterListener);
        
        // Add new listener and store reference
        categoryInput.addEventListener('input', newListener);
        categoryInput._filterListener = newListener;
    }
}

async function createNewCategory(categoryName, subject) {
    try {
        if (!subject) {
            showError('Please select a subject before creating a category');
            return false;
        }
        
        const response = await authenticatedFetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: categoryName, subject: subject })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create category');
        }
        
        const newCategory = await response.json();
        state.categories.push(newCategory);
        
        // Update all dropdowns
        updateCategoryFilterDropdown();
        populateCategoriesDatalist(subject);
        
        // Update filter dropdown if needed
        if (state.currentSubjectFilter === subject || !state.currentSubjectFilter) {
            const categoryFilter = document.getElementById('categoryFilter');
            const filterOption = document.createElement('option');
            filterOption.value = newCategory.name;
            filterOption.textContent = newCategory.name;
            categoryFilter.appendChild(filterOption);
        }
        
        showSuccess(`Category "${categoryName}" created successfully in ${subject}`);
        return true;
    } catch (error) {
        console.error('Error creating category:', error);
        showError('Failed to create category: ' + error.message);
        return false;
    }
}


function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        if (modalId === 'experimentModal') {
            state.editingExperimentId = null;
            state.modalItems = [];
            state.modalEditingItemIndex = null;
        } else if (modalId === 'itemModal') {
            state.editingItemData = null;
            state.modalEditingItemIndex = null;
        }
    }, 300);
}
function showAddExperimentModal() {
    state.editingExperimentId = null;
    state.modalItems = [];
    state.modalEditingItemIndex = null;
    document.getElementById('experimentModalTitle').textContent = 'Add Experiment';
    document.getElementById('experimentName').value = '';
    
    // **FIXED: Pre-select and lock subject field for non-admin users**
    const experimentSubject = document.getElementById('experimentSubject');
    const categoryInput = document.getElementById('experimentCategory');
    
    if (loginState.allowedSubject && loginState.allowedSubject !== "All") {
        experimentSubject.value = loginState.allowedSubject;
        experimentSubject.disabled = true;
        experimentSubject.style.cursor = 'not-allowed';
        experimentSubject.style.opacity = '0.6';
        
        // **FIXED: Enable category input and populate datalist since subject is pre-selected**
        categoryInput.value = '';
        categoryInput.removeAttribute('disabled');
        categoryInput.setAttribute('placeholder', 'Search or type new category');
        categoryInput.style.cursor = 'text';
        categoryInput.style.opacity = '1';
        populateCategoriesDatalist(loginState.allowedSubject);
    } else {
        experimentSubject.value = '';
        experimentSubject.disabled = false;
        experimentSubject.style.cursor = 'pointer';
        experimentSubject.style.opacity = '1';
        
        // **FIXED: Disable category until subject is selected**
        categoryInput.value = '';
        categoryInput.setAttribute('disabled', 'true');
        categoryInput.setAttribute('placeholder', 'Please select a subject first');
    }
    
    document.getElementById('experimentTrials').value = '1';
    
    for (let i = 6; i <= 12; i++) {
        const checkbox = document.getElementById(`grade${i}`);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.parentElement.classList.remove('selected');
        }
    }
    renderModalItems();
    showModal('experimentModal');
}

function editExperiment(expId, event) {
    event.stopPropagation();
    const exp = state.experiments.find(e => e.id === expId);
    if (!exp) {
        showError('Experiment not found');
        return;
    }
    
    state.editingExperimentId = expId;
    state.modalItems = JSON.parse(JSON.stringify(exp.items));
    state.modalEditingItemIndex = null;
    
    const expCategory = state.categories.find(cat => cat.name === exp.category);
    const subject = expCategory ? expCategory.subject : '';
    
    document.getElementById('experimentModalTitle').textContent = 'Edit Experiment';
    document.getElementById('experimentName').value = exp.name;
    
    const experimentSubject = document.getElementById('experimentSubject');
    experimentSubject.value = subject;
    
    // **NEW: Lock subject field for non-admin users**
    if (loginState.allowedSubject && loginState.allowedSubject !== "All") {
        experimentSubject.disabled = true;
        experimentSubject.style.cursor = 'not-allowed';
        experimentSubject.style.opacity = '0.6';
    } else {
        experimentSubject.disabled = false;
        experimentSubject.style.cursor = 'pointer';
        experimentSubject.style.opacity = '1';
    }
    
    document.getElementById('experimentCategory').value = exp.category || '';
    document.getElementById('experimentTrials').value = exp.trials || 1;
    
    if (subject) {
        document.getElementById('experimentCategory').removeAttribute('disabled');
        populateCategoriesDatalist(subject);
    }
    
    for (let i = 6; i <= 12; i++) {
        const checkbox = document.getElementById(`grade${i}`);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.parentElement.classList.remove('selected');
        }
    }
    
    if (exp.grade && Array.isArray(exp.grade)) {
        exp.grade.forEach(gradeNum => {
            const checkbox = document.getElementById(`grade${gradeNum}`);
            if (checkbox) {
                checkbox.checked = true;
                checkbox.parentElement.classList.add('selected');
            }
        });
    }
    
    renderModalItems();
    showModal('experimentModal');
}

async function saveExperiment() {
    const name = document.getElementById('experimentName').value.trim();
    const subject = document.getElementById('experimentSubject').value;
    const category = document.getElementById('experimentCategory').value.trim();
    const trials = Math.max(1, parseInt(document.getElementById('experimentTrials').value) || 1);
    
    // Get selected grades from checkboxes
    const grade = [];
    for (let i = 6; i <= 12; i++) {
        const checkbox = document.getElementById(`grade${i}`);
        if (checkbox && checkbox.checked) {
            grade.push(i);
        }
    }
    
    if (!name) {
        showError('Please enter an experiment name');
        return;
    }
    
    if (!subject) {
        showError('Please select a subject');
        return;
    }
    
    if (!category) {
        showError('Please select or enter a category');
        return;
    }
    
    // Check for duplicate experiment name (only when creating new, not editing)
    // if (!state.editingExperimentId) {
    //     const isDuplicate = state.experiments.some(exp => 
    //         exp.name.toLowerCase() === name.toLowerCase()
    //     );
        
    //     if (isDuplicate) {
    //         alert(`An experiment named "${name}" already exists. Please choose a different name.`);
    //         return;
    //     }
    // } else {
    //     // When editing, check if new name conflicts with OTHER experiments
    //     const isDuplicate = state.experiments.some(exp => 
    //         exp.id !== state.editingExperimentId && 
    //         exp.name.toLowerCase() === name.toLowerCase()
    //     );
        
    //     if (isDuplicate) {
    //         alert(`An experiment named "${name}" already exists. Please choose a different name.`);
    //         return;
    //     }
    // }
    // Check for duplicate experiment name
    const isDuplicate = state.experiments.some(exp => {
        // When editing, exclude current experiment from duplicate check
        if (state.editingExperimentId && exp.id === state.editingExperimentId) {
            return false;
        }
        return exp.name.toLowerCase() === name.toLowerCase();
    });

    if (isDuplicate) {
        alert(`An experiment named "${name}" already exists. Please choose a different name.`);
        return;
    }
    // Check if category exists
    const categoryExists = state.categories.some(cat => 
        cat.name.toLowerCase() === category.toLowerCase() && cat.subject === subject
    );
    
    if (!categoryExists) {
        const confirmCreate = confirm(`Category "${category}" doesn't exist in ${subject}. Create it?`);
        if (confirmCreate) {
            const created = await createNewCategory(category, subject);
            if (!created) return;
        } else {
            return;
        }
    }
    
    const isEditing = state.editingExperimentId ? true : false;
    
    // Build detailed message with ALL information
    let message = isEditing ? 'Save changes to experiment?\n\n' : 'Create new experiment?\n\n';
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Name: ${name}\n`;
    message += `Subject: ${subject}\n`;
    message += `Category: ${category}\n`;
    message += `Trials: ${trials}\n`;
    message += `Grades: ${grade.length > 0 ? grade.join(', ') : 'None'}\n`;
    message += `Items: ${state.modalItems.length}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    // Show all items with details
    if (state.modalItems.length > 0) {
        message += `\nItems List:\n`;
        state.modalItems.forEach((item, index) => {
            const categoryLabel = item.category === 'consumable' ? 'Consumable' : 
                                 item.category === 'packing' ? 'Packing' : 'Equipment';
            message += `${index + 1}. ${item.name}\n`;
            message += `   Qty: ${item.quantity} ${item.unit} | Price: ₹${item.price}/${item.unit} | ${categoryLabel}\n`;
        });
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    // Show changes if editing
    if (isEditing) {
        const currentExp = state.experiments.find(e => e.id === state.editingExperimentId);
        
        if (currentExp) {
            let changes = '\nChanges Made:\n';
            let hasChanges = false;
            
            if (currentExp.name !== name) {
                changes += `• Name: "${currentExp.name}" → "${name}"\n`;
                hasChanges = true;
            }
            
            // Get current category name
            const currentCategory = state.categories.find(cat => cat.name === currentExp.category);
            const currentSubject = currentCategory ? currentCategory.subject : '';
            
            if (currentSubject !== subject) {
                changes += `• Subject: "${currentSubject}" → "${subject}"\n`;
                hasChanges = true;
            }
            
            if (currentExp.category !== category) {
                changes += `• Category: "${currentExp.category}" → "${category}"\n`;
                hasChanges = true;
            }
            
            if (currentExp.trials !== trials) {
                changes += `• Trials: ${currentExp.trials} → ${trials}\n`;
                hasChanges = true;
            }
            
            const currentGrades = currentExp.grade || [];
            const gradesChanged = currentGrades.length !== grade.length || 
                !currentGrades.every(g => grade.includes(g));
            
            if (gradesChanged) {
                const oldGrades = currentGrades.length > 0 ? currentGrades.join(', ') : 'None';
                const newGrades = grade.length > 0 ? grade.join(', ') : 'None';
                changes += `• Grades: ${oldGrades} → ${newGrades}\n`;
                hasChanges = true;
            }
            
            // Check for item changes
            const itemChanges = detectItemChanges(currentExp.items, state.modalItems);
            if (itemChanges.hasChanges) {
                hasChanges = true;
                if (itemChanges.added.length > 0) {
                    changes += `• Items Added: ${itemChanges.added.length}\n`;
                    itemChanges.added.forEach(item => {
                        changes += `  + ${item.name} (${item.quantity} ${item.unit})\n`;
                    });
                }
                if (itemChanges.removed.length > 0) {
                    changes += `• Items Removed: ${itemChanges.removed.length}\n`;
                    itemChanges.removed.forEach(item => {
                        changes += `  - ${item.name} (${item.quantity} ${item.unit})\n`;
                    });
                }
                if (itemChanges.modified.length > 0) {
                    changes += `• Items Modified: ${itemChanges.modified.length}\n`;
                    itemChanges.modified.forEach(change => {
                        changes += `  ~ ${change.name}:\n`;
                        if (change.changes.quantity) {
                            changes += `    Qty: ${change.changes.quantity.old} → ${change.changes.quantity.new}\n`;
                        }
                        if (change.changes.unit) {
                            changes += `    Unit: ${change.changes.unit.old} → ${change.changes.unit.new}\n`;
                        }
                        if (change.changes.price) {
                            changes += `    Price: ₹${change.changes.price.old} → ₹${change.changes.price.new}\n`;
                        }
                        if (change.changes.category) {
                            changes += `    Category: ${change.changes.category.old} → ${change.changes.category.new}\n`;
                        }
                    });
                }
            }
            
            if (!hasChanges) {
                alert('No changes detected');
                return;
            }
            
            message += changes;
        }
    }
    
    if (!confirm(message)) {
        return;
    }
    
    console.log('Saving experiment with grades:', grade);
    
    if (state.editingExperimentId) {
        await updateExperimentWithItems(state.editingExperimentId, name, category, trials, grade);
    } else {
        await createExperimentWithItems(name, category, trials, grade);
    }
    
    closeModal('experimentModal');
}

// Helper function to detect item changes
function detectItemChanges(oldItems, newItems) {
    const result = {
        hasChanges: false,
        added: [],
        removed: [],
        modified: []
    };
    
    // Find added items
    newItems.forEach(newItem => {
        const oldItem = oldItems.find(old => old.id === newItem.id);
        if (!oldItem) {
            result.added.push(newItem);
            result.hasChanges = true;
        }
    });
    
    // Find removed items
    oldItems.forEach(oldItem => {
        const newItem = newItems.find(n => n.id === oldItem.id);
        if (!newItem) {
            result.removed.push(oldItem);
            result.hasChanges = true;
        }
    });
    
    // Find modified items
    newItems.forEach(newItem => {
        const oldItem = oldItems.find(old => old.id === newItem.id);
        if (oldItem) {
            const changes = {};
            let hasItemChanges = false;
            
            if (oldItem.name !== newItem.name) {
                changes.name = { old: oldItem.name, new: newItem.name };
                hasItemChanges = true;
            }
            if (oldItem.quantity !== newItem.quantity) {
                changes.quantity = { old: oldItem.quantity, new: newItem.quantity };
                hasItemChanges = true;
            }
            if (oldItem.unit !== newItem.unit) {
                changes.unit = { old: oldItem.unit, new: newItem.unit };
                hasItemChanges = true;
            }
            if (oldItem.price !== newItem.price) {
                changes.price = { old: oldItem.price, new: newItem.price };
                hasItemChanges = true;
            }
            if (oldItem.category !== newItem.category) {
                const oldCat = oldItem.category === 'consumable' ? 'Consumable' : 
                              oldItem.category === 'packing' ? 'Packing' : 'Equipment';
                const newCat = newItem.category === 'consumable' ? 'Consumable' : 
                              newItem.category === 'packing' ? 'Packing' : 'Equipment';
                changes.category = { old: oldCat, new: newCat };
                hasItemChanges = true;
            }
            
            if (hasItemChanges) {
                result.modified.push({
                    name: newItem.name,
                    changes: changes
                });
                result.hasChanges = true;
            }
        }
    });
    
    return result;
}


// Make sure toggleGrade function is defined
function toggleGrade(grade) {
    const checkbox = document.getElementById(`grade${grade}`);
    if (!checkbox) return;
    
    checkbox.checked = !checkbox.checked;
    
    const container = checkbox.parentElement;
    if (checkbox.checked) {
        container.classList.add('selected');
    } else {
        container.classList.remove('selected');
    }
}

function showAddItemModal(expId, event) {
    event.stopPropagation();
    state.editingItemData = { expId, itemId: null };
    document.getElementById('itemModalTitle').textContent = 'Add Item';
    
    document.getElementById('itemName').value = '';
    document.getElementById('itemQuantity').value = '1';
    document.getElementById('itemUnit').value = 'ml';
    document.getElementById('itemPrice').value = '0';
    document.getElementById('itemCategory').value = 'consumable';
    
    // Reset datalist to show all items
    populateItemsDatalist();
    
    showModal('itemModal');
}

function editItem(expId, itemId, event) {
    event.stopPropagation(); // Prevent card selection
    const exp = state.experiments.find(e => e.id === expId);
    if (!exp) return;
    
    const item = exp.items.find(i => i.id === itemId);
    if (!item) return;
    
    state.editingItemData = { expId, itemId };
    document.getElementById('itemModalTitle').textContent = 'Edit Item';
    
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemUnit').value = item.unit;
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemCategory').value = item.category;
    
    showModal('itemModal');
}

async function addItemToExperiment(expId, itemData) {
    try {
        const response = await authenticatedFetch(`/api/experiments/${expId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add item');
        }
        
        await loadExperiments(); // Refresh after add
        showSuccess('Item added successfully');
    } catch (error) {
        console.error('Error adding item:', error);
        showError(error.message || 'Failed to add item');
    }
}

async function updateItem(expId, itemId, itemData) {
    try {
        const response = await authenticatedFetch(`/api/experiments/${expId}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) throw new Error('Failed to update item');
        
        await loadExperiments(); // Refresh after update
        showSuccess('Item updated successfully');
    } catch (error) {
        console.error('Error updating item:', error);
        showError('Failed to update item: ' + error.message);
    }
}
function saveItem() {
    const itemData = {
        name: document.getElementById('itemName').value.trim(),
        quantity: parseFloat(document.getElementById('itemQuantity').value) || 0,
        unit: document.getElementById('itemUnit').value,
        price: parseFloat(document.getElementById('itemPrice').value) || 0,
        category: document.getElementById('itemCategory').value
    };
    
    if (!itemData.name) {
        alert('Please enter an item name');
        return;
    }
    
    if (itemData.quantity <= 0) {
        alert('Quantity must be greater than 0');
        return;
    }
    
    if (itemData.price <= 0) {
        alert('Price cannot be negative or zero');
        return;
    }
    
    // Check for duplicate item when adding (not when editing)
    if (!state.editingItemData.itemId) {
        const exp = state.experiments.find(e => e.id === state.editingItemData.expId);
        if (exp) {
            const isDuplicate = exp.items.some(item => 
                item.name.toLowerCase() === itemData.name.toLowerCase()
            );
            
            if (isDuplicate) {
                alert(`Item "${itemData.name}" is already in this experiment. Please choose a different item or edit the existing one.`);
                return;
            }
        }
    }
    
    const isEditing = state.editingItemData?.itemId ? true : false;
    
    // Build detailed message
    let message = isEditing ? 'Save changes to item?\n\n' : 'Add new item to experiment?\n\n';
    message += `Name: ${itemData.name}\n`;
    message += `Quantity: ${itemData.quantity} ${itemData.unit}\n`;
    message += `Price: ₹${itemData.price}/${itemData.unit}\n`;
    message += `Category: ${itemData.category === 'consumable' ? 'Consumable' : itemData.category === 'packing' ? 'Packing Material' : 'Equipment'}`;
    
    // Show changes if editing
    if (isEditing) {
        const exp = state.experiments.find(e => e.id === state.editingItemData.expId);
        const currentItem = exp?.items.find(i => i.id === state.editingItemData.itemId);
        
        if (currentItem) {
            let changes = '\n\nChanges:';
            let hasChanges = false;
            
            if (currentItem.name !== itemData.name) {
                changes += `\n• Name: "${currentItem.name}" → "${itemData.name}"`;
                hasChanges = true;
            }
            if (currentItem.quantity !== itemData.quantity) {
                changes += `\n• Quantity: ${currentItem.quantity} → ${itemData.quantity}`;
                hasChanges = true;
            }
            if (currentItem.unit !== itemData.unit) {
                changes += `\n• Unit: ${currentItem.unit} → ${itemData.unit}`;
                hasChanges = true;
            }
            if (currentItem.price !== itemData.price) {
                changes += `\n• Price: ₹${currentItem.price} → ₹${itemData.price}`;
                hasChanges = true;
            }
            if (currentItem.category !== itemData.category) {
                const oldCat = currentItem.category === 'consumable' ? 'Consumable' : currentItem.category === 'packing' ? 'Packing Material' : 'Equipment';
                const newCat = itemData.category === 'consumable' ? 'Consumable' : itemData.category === 'packing' ? 'Packing Material' : 'Equipment';
                changes += `\n• Category: ${oldCat} → ${newCat}`;
                hasChanges = true;
            }
            
            if (!hasChanges) {
                alert('No changes detected');
                return;
            }
            
            message += changes;
        }
    }

    if (!confirm(message)) {
        return;
    }
    
    if (state.editingItemData.itemId) {
        updateItem(state.editingItemData.expId, state.editingItemData.itemId, itemData);
    } else {
        addItemToExperiment(state.editingItemData.expId, itemData);
    }
    
    closeModal('itemModal');
}

async function showCreateAccountModal() {
    // Check if user is admin
    if (loginState.username !== 'admin') {
        showError('Only administrators can create new accounts');
        return;
    }
    
    const modal = document.getElementById('createAccountModal');
    if (!modal) {
        showError('Create account modal not found');
        return;
    }
    
    // Clear fields
    document.getElementById('createAccountUsername').value = '';
    document.getElementById('createAccountPassword').value = '';
    document.getElementById('createAccountConfirmPassword').value = '';
    document.getElementById('createAccountSubject').value = '';
    
    showModal('createAccountModal');
}

async function handleCreateAccount(event) {
    event.preventDefault();
    
    // Double check admin permission
    if (loginState.username !== 'admin') {
        showError('Only administrators can create new accounts');
        return;
    }
    
    const username = document.getElementById('createAccountUsername').value.trim();
    const password = document.getElementById('createAccountPassword').value;
    const confirmPassword = document.getElementById('createAccountConfirmPassword').value;
    const subject = document.getElementById('createAccountSubject').value;
    
    if (!username || !password || !confirmPassword || !subject) {
        showError('Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }
    
    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
        showError('Username must be 3-20 characters (letters, numbers, underscore only)');
        return;
    }
    
    if (!confirm(`Create new account?\n\nUsername: ${username}\nSubject: ${subject}\n\nThe user will be able to access ${subject} experiments.`)) {
        return;
    }
    
    // ✅ NEW: Prompt for admin password for verification
    const adminPassword = prompt('Enter your admin password to confirm account creation:');
    if (!adminPassword) {
        showError('Admin password required to create account');
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/create-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                admin_username: loginState.username,
                admin_password: adminPassword,  // ✅ NEW: Send admin password
                new_username: username,
                new_password: password,
                subject: subject
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create account');
        }
        
        const result = await response.json();
        
        showSuccess(`Account "${result.username}" created successfully!`);
        closeModal('createAccountModal');
    } catch (error) {
        showError(error.message || 'Failed to create account');
    }
}

// Add this function after handleLogout()
async function showChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    if (!modal) {
        showError('Password change modal not found');
        return;
    }
    
    // Clear fields
    document.getElementById('changePasswordUsername').value = loginState.username || '';
    document.getElementById('changePasswordCurrent').value = '';
    document.getElementById('changePasswordNew').value = '';
    document.getElementById('changePasswordConfirm').value = '';
    
    showModal('changePasswordModal');
}

async function handleChangePassword(event) {
    event.preventDefault();
    
    const username = document.getElementById('changePasswordUsername').value.trim();
    const currentPassword = document.getElementById('changePasswordCurrent').value;
    const newPassword = document.getElementById('changePasswordNew').value;
    const confirmPassword = document.getElementById('changePasswordConfirm').value;
    
    if (!username || !currentPassword || !newPassword || !confirmPassword) {
        showError('Please fill in all fields');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showError('New passwords do not match');
        return;
    }
    
    if (newPassword.length < 6) {
        showError('New password must be at least 6 characters');
        return;
    }
    
    if (currentPassword === newPassword) {
        showError('New password must be different from current password');
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to change password');
        }
        
        showSuccess('Password changed successfully!');
        closeModal('changePasswordModal');
        
        // Optionally logout user after password change
        if (confirm('Password changed successfully. Do you want to logout and login again?')) {
            handleLogout();
        }
    } catch (error) {
        showError(error.message || 'Failed to change password');
    }
}


// Add after the handleChangePassword function

async function showChangeUsernameModal() {
    const modal = document.getElementById('changeUsernameModal');
    if (!modal) {
        showError('Username change modal not found');
        return;
    }
    
    // Clear fields
    document.getElementById('changeUsernameCurrentUsername').value = loginState.username || '';
    document.getElementById('changeUsernamePassword').value = '';
    document.getElementById('changeUsernameNewUsername').value = '';
    
    showModal('changeUsernameModal');
}

async function handleChangeUsername(event) {
    event.preventDefault();
    
    const currentUsername = document.getElementById('changeUsernameCurrentUsername').value.trim();
    const password = document.getElementById('changeUsernamePassword').value;
    const newUsername = document.getElementById('changeUsernameNewUsername').value.trim();
    
    if (!currentUsername || !password || !newUsername) {
        showError('Please fill in all fields');
        return;
    }
    
    if (currentUsername === newUsername) {
        showError('New username must be different from current username');
        return;
    }
    
    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
        showError('Username must be 3-20 characters (letters, numbers, underscore only)');
        return;
    }
    
    if (!confirm(`Change username from "${currentUsername}" to "${newUsername}"?\n\nYou will need to logout and login again with the new username.`)) {
        return;
    }
    
    try {
        const response = await authenticatedFetch('/api/change-username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_username: currentUsername,
                password: password,
                new_username: newUsername
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to change username');
        }
        
        const result = await response.json();
        
        showSuccess(`Username changed successfully to "${result.new_username}"!`);
        closeModal('changeUsernameModal');
        
        // Force logout after username change
        setTimeout(() => {
            alert(`Your username has been changed to "${result.new_username}".\n\nPlease login again with your new username.`);
            handleLogout();
        }, 1500);
    } catch (error) {
        showError(error.message || 'Failed to change username');
    }
}
// Replace your showAccountSettingsModal function in script.js with this fixed version:

function showAccountSettingsModal() {
    const modal = document.getElementById('accountSettingsModal');
    if (!modal) {
        showError('Settings modal not found');
        return;
    }
    
    // Try to get current login info from session storage if loginState is not set
    if (!loginState.username || !loginState.selectedSubject) {
        const savedLogin = sessionStorage.getItem('labLogin');
        if (savedLogin) {
            try {
                const loginData = JSON.parse(savedLogin);
                loginState.username = loginData.username;
                loginState.selectedSubject = loginData.subject;
                loginState.allowedSubject = loginData.allowed_subject;
            } catch (e) {
                console.error('Failed to parse login data:', e);
            }
        }
    }
    
    // Set the values
    document.getElementById('settingsCurrentUser').textContent = loginState.username || 'Not logged in';
    document.getElementById('settingsCurrentSubject').textContent = loginState.selectedSubject || 'No subject selected';
    
    // ✅ FIX: Show/hide Create Account button for admin only
    const createAccountBtn = document.getElementById('createAccountBtn');
    if (createAccountBtn) {
        console.log('Current username:', loginState.username); // Debug log
        console.log('Allowed subject:', loginState.allowedSubject); // Debug log
        
        // Check if user is admin (username is 'admin' OR allowedSubject is 'All')
        if (loginState.username === 'admin' || loginState.allowedSubject === 'All') {
            createAccountBtn.style.display = 'flex';  // Show button
            console.log('Showing create account button'); // Debug log
        } else {
            createAccountBtn.style.display = 'none';  // Hide button
            console.log('Hiding create account button'); // Debug log
        }
    } else {
        console.error('Create account button not found in DOM'); // Debug log
    }
    
    showModal('accountSettingsModal');
}
// ==================== UTILITY FUNCTIONS ====================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    alert(message);
    const container = document.querySelector('header');
    if (container && container.parentNode) {
        container.parentNode.insertBefore(errorDiv, container.nextSibling);
    } else {
        document.body.prepend(errorDiv);
    }

    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}


function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;

    const container = document.querySelector('header');
    if (container && container.parentNode) {
        container.parentNode.insertBefore(successDiv, container.nextSibling);
    } else {
        document.body.prepend(successDiv);
    }

    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}
async function authenticatedFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'same-origin', // Include cookies
    });
    
    if (response.status === 401) {
        // Only handle logout if not already logged out
        if (loginState.isLoggedIn) {
            loginState.isLoggedIn = false;
            loginState.username = null;
            loginState.selectedSubject = null;
            loginState.allowedSubject = null;
            sessionStorage.removeItem('labLogin');
            localStorage.removeItem('labLogin');

            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginSubject').value = '';

            const loginSubject = document.getElementById('loginSubject');
            loginSubject.disabled = false;
            loginSubject.style.cursor = 'pointer';
            loginSubject.style.opacity = '1';
            loginSubject.parentElement.style.display = 'block';

            const rememberMeCheckbox = document.getElementById('rememberMe');
            if (rememberMeCheckbox) {
                rememberMeCheckbox.checked = false;
            }
            
            showError('Your session has expired. Please login again.');
            showLoginModal();
        }
        throw new Error('Session expired');
    }
    
    return response;
}
// ==================== ITEM PRICE MANAGER (SIDEBAR) ====================

function toggleItemPriceManager() {
    const sidebar = document.getElementById('itemPriceManagerSidebar');
    if (sidebar.classList.contains('show')) {
        closeItemPriceManager();
    } else {
        showItemPriceManager();
    }
}

async function showItemPriceManager() {
    const sidebar = document.getElementById('itemPriceManagerSidebar');
    if (!sidebar) {
        showError('Item price manager sidebar not found');
        return;
    }
    
    // Populate subject dropdown
    const subjectSelect = document.getElementById('priceManagerSubject');
    const subjects = [...new Set(state.categories.map(cat => cat.subject))].sort();
    
    subjectSelect.innerHTML = '<option value="">All Subjects</option>';
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectSelect.appendChild(option);
    });
    
    if (loginState.allowedSubject && loginState.allowedSubject !== "All") {
        subjectSelect.value = loginState.allowedSubject;
        subjectSelect.disabled = true;
        subjectSelect.style.cursor = 'not-allowed';
        subjectSelect.style.opacity = '0.6';
        await filterItemsBySubject();
    } else {
        // 🔹 FIX: Admin sees all items by default
        subjectSelect.value = '';
        subjectSelect.disabled = false;
        subjectSelect.style.cursor = 'pointer';
        subjectSelect.style.opacity = '1';
        await filterItemsBySubject();
    }
    
    sidebar.classList.add('show');
    document.body.style.overflow = 'hidden'; // Prevent background scroll
}

function closeItemPriceManager() {
    const sidebar = document.getElementById('itemPriceManagerSidebar');
    if (sidebar) {
        sidebar.classList.remove('show');
        document.body.style.overflow = ''; // Restore scroll
    }
}
async function filterItemsBySubject() {
    const selectedSubject = document.getElementById('priceManagerSubject').value;
    const container = document.getElementById('itemsPriceList');
    
    // Show all items or filter by specific subject
    let subjectItems;
    
    if (!selectedSubject || selectedSubject === '') {
        // Show all items
        subjectItems = [...itemsCache];
    } else {
        // Filter by specific subject
        const subjectCategories = state.categories
            .filter(cat => cat.subject === selectedSubject)
            .map(cat => cat.name);
        
        const subjectExperiments = state.experiments.filter(exp => 
            subjectCategories.includes(exp.category)
        );
        
        const uniqueItemIds = new Set();
        subjectExperiments.forEach(exp => {
            exp.items.forEach(item => {
                uniqueItemIds.add(item.id);
            });
        });
        
        subjectItems = itemsCache.filter(item => uniqueItemIds.has(item.id));
    }
    
    if (subjectItems.length === 0) {
        container.innerHTML = '<div class="no-items">No items found</div>';
        updateItemStats(0, 0, 0);
        return;
    }
    
    subjectItems.sort((a, b) => a.name.localeCompare(b.name));
    
    const consumableCount = subjectItems.filter(i => i.category === 'consumable').length;
    const equipmentCount = subjectItems.filter(i => i.category === 'non_consumable').length;
    updateItemStats(subjectItems.length, consumableCount, equipmentCount);
    
    container.innerHTML = subjectItems.map(item => {
        const categoryLabel = item.category === 'consumable' ? 'Consumable' :
                             item.category === 'packing' ? 'Packing' : 'Equipment';
        const categoryClass = item.category === 'consumable' ? 'consumable' :
                             item.category === 'packing' ? 'packing' : 'equipment';
        
        return `
            <div class="item-price-row">
                <div class="item-price-info">
                    <div class="item-price-name">${escapeHtml(item.name)}</div>
                    <div class="item-price-details">
                        ID: ${item.id}
                        <span class="item-price-category ${categoryClass}">${categoryLabel}</span>
                    </div>
                </div>
                
                <div class="item-price-control-row">
                    <div class="item-price-input-group">
                        <span>₹</span>
                        <input type="number" 
                               id="price_${item.id}" 
                               value="${item.price_per_unit}" 
                               step="0.01"
                               min="0"
                               data-original="${item.price_per_unit}"
                               oninput="markPriceChanged('${item.id}')">
                        <span>/ ${item.unit}</span>
                    </div>
                    
                    <button class="btn-save-price" 
                            id="save_${item.id}"
                            onclick="saveItemPrice('${item.id}')"
                            disabled>
                        <i class="bi bi-check-lg"></i> Save
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateItemStats(total, consumable, equipment) {
    document.getElementById('totalItemsCount').textContent = total;
    document.getElementById('consumableCount').textContent = consumable;
    document.getElementById('equipmentCount').textContent = equipment;
}

function markPriceChanged(itemId) {
    const priceInput = document.getElementById(`price_${itemId}`);
    const saveBtn = document.getElementById(`save_${itemId}`);
    
    if (!priceInput || !saveBtn) return;
    
    const currentValue = parseFloat(priceInput.value);
    const originalValue = parseFloat(priceInput.getAttribute('data-original'));
    
    // Check if value has changed and is valid
    if (!isNaN(currentValue) && currentValue >= 0 && currentValue !== originalValue) {
        saveBtn.disabled = false;
        saveBtn.classList.add('changed');
        saveBtn.innerHTML = '<i class="bi bi-floppy"></i> Save Changes';
    } else {
        saveBtn.disabled = true;
        saveBtn.classList.remove('changed');
        saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Save';
    }
}
async function saveItemPrice(itemId) {
    const priceInput = document.getElementById(`price_${itemId}`);
    const saveBtn = document.getElementById(`save_${itemId}`);
    
    if (!priceInput) return;
    
    const newPrice = parseFloat(priceInput.value);
    
    if (isNaN(newPrice) || newPrice < 0) {
        showError('Please enter a valid price (minimum 0)');
        return;
    }
    
    const item = itemsCache.find(i => i.id === itemId);
    if (!item) {
        showError('Item not found');
        return;
    }
    
    if (!confirm(`Update price of "${item.name}"?\n\nOld Price: ₹${item.price_per_unit}/${item.unit}\nNew Price: ₹${newPrice}/${item.unit}`)) {
        return;
    }
    
    try {
        saveBtn.disabled = true;
        saveBtn.classList.remove('changed');
        saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
        
        const response = await authenticatedFetch(`/api/items/${itemId}/price`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: newPrice })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update price');
        }
        
        // Update local cache
        item.price_per_unit = newPrice;
        priceInput.setAttribute('data-original', newPrice); // Update original value
        
        saveBtn.innerHTML = '<i class="bi bi-check-circle"></i> Saved!';
        saveBtn.style.background = '#10b981';
        
        setTimeout(() => {
            saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Save';
            saveBtn.disabled = true;
            saveBtn.classList.remove('changed');
        }, 2000);
        
        showSuccess(`Price updated: ${item.name} = ₹${newPrice}/${item.unit}`);
        
        if (state.selectedExperiments.size > 0) {
            await calculateCosts();
        }
    } catch (error) {
        console.error('Error updating price:', error);
        showError(error.message || 'Failed to update price');
        saveBtn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Retry';
        saveBtn.disabled = false;
        saveBtn.classList.add('changed');
        saveBtn.style.background = '#f59e0b';
    }
}

// ==================== GLOBAL EVENT HANDLERS ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Prevent closing login modal without credentials
        const loginModal = document.getElementById('loginModal');
        if (loginModal && loginModal.classList.contains('show') && !loginState.isLoggedIn) {
            return;
        }
    }
    
    if (e.key === 'Enter') {
        // Prevent default form submission
        
        const loginModal = document.getElementById('loginModal');
        const experimentModal = document.getElementById('experimentModal');
        const itemModal = document.getElementById('itemModal');
        const previewModal = document.getElementById('previewModal');

        // **NEW: Handle login modal**
        if (loginModal && loginModal.classList.contains('show')) {
            e.preventDefault();
            handleLogin(e);
            return;
        }

        // Check which modal is visible and on top (has 'show' class)
        // Priority: itemModal > previewModal > experimentModal
        if (itemModal && itemModal.classList.contains('show')) {
            e.preventDefault();
            // Check if we're in the experiment modal's item editor or standalone item editor
            if (state.modalEditingItemIndex !== null) {
                saveModalItem();
            } else {
                saveItem();
            }
        } else if (previewModal && previewModal.classList.contains('show')) {
            // Do nothing or close preview modal
            return;
        } else if (experimentModal && experimentModal.classList.contains('show')) {
            e.preventDefault();
            saveExperiment();
        }
    }
});
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        // Prevent closing login modal without credentials
        if (e.target.id === 'loginModal' && !loginState.isLoggedIn) {
            return;
        }
        closeModal(e.target.id);
    }
    if (e.target.id === 'itemPriceManagerSidebar' && e.target.classList.contains('sidebar-overlay')) {
        closeItemPriceManager();
    }
});
