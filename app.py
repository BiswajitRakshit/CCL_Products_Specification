"""
Laboratory Experiment Cost Estimator
Flask Application with Separate Database Files
"""

from flask import Flask, render_template, jsonify, request, session
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import json
import os
import secrets
from datetime import timedelta
from waitress import serve

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))  # ✅ Use env variable in production
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set True if using HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

app.config["DEBUG"] = False


USERS_FILE = "users.json"
EXPERIMENTS_FILE = 'experiments.json'
ITEMS_FILE = 'items.json'
CATEGORIES_FILE = 'exp_catagories.json'

# ==================== AUTHENTICATION DECORATOR ====================

def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin privileges"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return jsonify({'error': 'Authentication required'}), 401

        username = session['username']
        users = load_users()
        if username not in users or users[username].get('subject') != 'All':
            return jsonify({'error': 'Admin privileges required'}), 403
        return f(*args, **kwargs)
    return decorated_function

# ==================== FILE OPERATIONS ====================

def load_users():
    try:
        with open(USERS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

def load_json_file(filepath, default_value):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")
            return default_value
    return default_value

def save_json_file(filepath, data):
    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving {filepath}: {e}")


def load_all_data():
    """Load all database files"""
    experiments = load_json_file(EXPERIMENTS_FILE, {})
    items_data = load_json_file(ITEMS_FILE, {'items': []})
    categories_data = load_json_file(CATEGORIES_FILE, {'categories': []})
    
    return experiments, items_data, categories_data

# Load data on startup
experiments_db, items_data, categories_data = load_all_data()

# ==================== HELPER FUNCTIONS ====================

def get_item_by_id(item_id):
    """Get item details from items database"""
    for item in items_data['items']:
        if item['id'] == item_id:
            return item
    return None

def get_category_by_id(category_id):
    """Get category name from categories database"""
    for cat in categories_data['categories']:
        if cat['id'] == category_id:
            return cat['name']
    return 'Unknown'


def get_category_id_by_name(category_name):
    """Get category ID from category name"""
    for cat in categories_data['categories']:
        if cat['name'] == category_name:
            return cat['id']
    return ''


def build_experiment_response(exp_data):
    """Build full experiment response with item and category details"""
    result = {
        'id': exp_data['id'],
        'name': exp_data['name'],
        'trials': exp_data.get('trials', 1),
        'category': get_category_by_id(exp_data.get('category', '')),
        'category_id': exp_data.get('category', ''),
        'grade': exp_data.get('grade', []),
        'items': []
    }
    
    # Populate items with full details
    for exp_item in exp_data.get('items', []):
        item_details = get_item_by_id(exp_item['id'])
        if item_details:
            result['items'].append({
                'id': exp_item['id'],
                'name': item_details['name'],
                'quantity': exp_item['quantity'],
                'unit': item_details['unit'],
                'price': item_details['price_per_unit'],
                'category': item_details.get('category', 'consumable')
            })
    
    return result

def check_subject_access(username, requested_subject):
    """Check if user can access the requested subject"""
    users = load_users()
    if username not in users:
        return False
    
    allowed_subject = users[username].get('subject')
    if allowed_subject == 'All':
        return True
    return allowed_subject == requested_subject


# ==================== ROUTES ====================

@app.route('/')
def index():
    return render_template('index.html')

# ==================== AUTH ROUTES ===================
@app.route('/api/login', methods=['POST'])
def login():
    """Validate login and return user's subject"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        subject = data.get('subject')
        remember_me = data.get('remember_me', True)  # Default to True for backward compatibility
    
        if not username or not password:
            return jsonify({'error': 'Missing credentials'}), 400
    
        users = load_users()
        
        # ✅ CHECK 1: Does username exist?
        if username not in users:
            # Find similar usernames (case-insensitive, partial match)
            similar_users = []
            username_lower = username.lower()
            
            for existing_user in users.keys():
                existing_lower = existing_user.lower()
                # Check if input is substring of existing username
                if username_lower in existing_lower or existing_lower in username_lower:
                    similar_users.append(existing_user)
                # Check if they share common characters (more than 50%)
                elif len(set(username_lower) & set(existing_lower)) >= len(username_lower) * 0.5:
                    similar_users.append(existing_user)
            
            error_msg = f'Username "{username}" not found'
            if similar_users:
                error_msg += f'. Did you mean: {", ".join(similar_users[:3])}?'
            
            return jsonify({
                'error': error_msg,
                'error_type': 'username_not_found',
                'similar_usernames': similar_users[:3]  # Return max 3 suggestions
            }), 401
        
        # ✅ CHECK 2: Is password correct?
        if not check_password_hash(users[username]["password"], password):
            return jsonify({
                'error': 'Incorrect password',
                'error_type': 'wrong_password',
                'username': username
            }), 401

        allowed_subject = users[username]["subject"]
        
        # Handle admin "All" access
        if allowed_subject == "All":
            if not subject or subject == "":
                subject = "All Subjects"
            session['username'] = username
            session['subject'] = subject
            session['allowed_subject'] = allowed_subject
            session.permanent = remember_me  # Use remember_me flag
            
            return jsonify({
                'username': username,
                'subject': subject,
                'allowed_subject': allowed_subject
            }), 200
        
        # Non-admin users
        if not subject:
            return jsonify({'error': 'Subject selection required'}), 400
            
        if allowed_subject != subject:
            return jsonify({'error': f'You are not authorized to access {subject}'}), 403
        
        session['username'] = username
        session['subject'] = subject
        session['allowed_subject'] = allowed_subject
        session.permanent = remember_me 
        
        return jsonify({
            'username': username,
            'subject': subject,
            'allowed_subject': allowed_subject
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    """Clear session and logout"""
    session.clear()
    return jsonify({'message': 'Logged out successfully'}), 200


@app.route('/api/create-account', methods=['POST'])
@admin_required 
def create_account():
    """Create a new user account (admin only)"""
    try:
        data = request.get_json()
        admin_username = data.get('admin_username')
        admin_password = data.get('admin_password')  # NEW: Require admin password
        new_username = data.get('new_username')
        new_password = data.get('new_password')
        subject = data.get('subject')
        
        if not all([admin_username, admin_password, new_username, new_password, subject]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        users = load_users()
        
        if not check_password_hash(users[admin_username]["password"], admin_password):
            return jsonify({'error': 'Unauthorized: Invalid admin credentials'}), 403
        
        # Check if user is actually admin
        if users[admin_username]["subject"] != "All":
            return jsonify({'error': 'Unauthorized: Only administrators can create accounts'}), 403
        
        # Check if username already exists
        if new_username in users:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Validate new username
        import re
        if not re.match(r'^[a-zA-Z0-9_]{3,20}$', new_username):
            return jsonify({'error': 'Username must be 3-20 characters (letters, numbers, underscore only)'}), 400
        
        # Validate password
        if len(new_password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        # Validate subject
        valid_subjects = ['All', 'Chemistry', 'Physics', 'Biology']
        if subject not in valid_subjects:
            return jsonify({'error': 'Invalid subject'}), 400
        
        # Create new user
        users[new_username] = {
            'password': generate_password_hash(new_password),
            'subject': subject
        }
        save_users(users)
        
        return jsonify({
            'message': 'Account created successfully',
            'username': new_username,
            'subject': subject
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    """Change user password"""
    try:
        data = request.get_json()
        username = data.get('username')
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not username or not current_password or not new_password:
            return jsonify({'error': 'Missing required fields'}), 400
        
        users = load_users()

        # Verify current password
        if username not in users or not check_password_hash(users[username]["password"], current_password):
            return jsonify({'error': 'Invalid username or current password'}), 401

        # Validate new password (minimum 6 characters)
        if len(new_password) < 6:
            return jsonify({'error': 'New password must be at least 6 characters'}), 400
        
        # Update password
        users[username]["password"] = generate_password_hash(new_password)
        save_users(users)
        
        return jsonify({'message': 'Password changed successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
# Add these new routes after the change_password route

@app.route('/api/change-username', methods=['POST'])
@login_required
def change_username():
    """Change username"""
    try:
        data = request.get_json()
        current_username = data.get('current_username')
        password = data.get('password')
        new_username = data.get('new_username')
        
        if not current_username or not password or not new_username:
            return jsonify({'error': 'Missing required fields'}), 400
        
        users = load_users()
        # Verify current username and password
        if current_username not in users or not check_password_hash(users[current_username]["password"], password):
            return jsonify({'error': 'Invalid username or password'}), 401

        
        # Check if new username already exists
        if new_username in users:
            return jsonify({'error': 'Username already exists'}), 400
        
        # Validate new username (alphanumeric and underscore only, 3-20 chars)
        import re
        if not re.match(r'^[a-zA-Z0-9_]{3,20}$', new_username):
            return jsonify({'error': 'Username must be 3-20 characters (letters, numbers, underscore only)'}), 400
        
        # Update username
        users[new_username] = users.pop(current_username)
        save_users(users)
        
        # Update subject mapping
        # if current_username in user_subjects:
        #     user_subjects[new_username] = user_subjects.pop(current_username)
        
        return jsonify({
            'message': 'Username changed successfully',
            'new_username': new_username
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-profile', methods=['GET'])
@login_required
def get_user_profile():
    """Get current user profile info"""
    try:
        # In a real app, you'd get this from session/token
        # For now, we'll just return available usernames for admin purposes
        users = load_users()
        return jsonify({
            'users': list(users.keys())
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
# ==================== API ROUTES ====================

@app.route('/api/items', methods=['GET'])
@login_required
def get_all_items():
    """Get all items"""
    return jsonify(items_data)

# Replace the create_category route
@app.route('/api/categories', methods=['POST'])
@login_required
def create_category():
    """Create a new category"""
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Missing category name'}), 400
        
        if 'subject' not in data:
            return jsonify({'error': 'Missing subject'}), 400
        
        # Check if category already exists in this subject
        for cat in categories_data['categories']:
            if cat['name'].lower() == data['name'].lower() and cat['subject'] == data['subject']:
                return jsonify({'error': 'Category already exists in this subject'}), 400
        
        # Generate new ID
        max_num = 0
        for cat in categories_data['categories']:
            try:
                num = int(cat['id'].replace('CAT', ''))
                max_num = max(max_num, num)
            except:
                pass
        new_id = f"CAT{max_num + 1:04d}"
        
        new_category = {
            'id': new_id,
            'subject': data['subject'],
            'name': data['name']
        }
        
        categories_data['categories'].append(new_category)
        save_json_file(CATEGORIES_FILE, categories_data)
        
        return jsonify(new_category), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

@app.route('/api/experiments', methods=['GET'])
@login_required
def get_all_experiments():
    """Get all experiments with full details"""
    result = []
    for exp_id, exp_data in experiments_db.items():
        result.append(build_experiment_response(exp_data))
    return jsonify(result)

@app.route('/api/experiments', methods=['POST'])
@login_required
def create_experiment():
    """Create a new experiment"""
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({'error': 'Missing experiment name'}), 400
        
        # Generate new ID
        max_num = 0
        for exp_id in experiments_db.keys():
            try:
                num = int(exp_id.replace('EXP', ''))
                max_num = max(max_num, num)
            except:
                pass
        new_id = f"EXP{max_num + 1:03d}"
        
        # Find category ID from name
        category_name = data.get('category', 'Molecular Biology')
        category_id = get_category_id_by_name(category_name)
        
        new_experiment = {
            'id': new_id,
            'name': data.get('name', 'New Experiment'),
            'category': category_id,
            'trials': max(1, int(data.get('trials', 1))),
            'grade': data.get('grade', []),
            'items': []
        }
        
        experiments_db[new_id] = new_experiment
        save_json_file(EXPERIMENTS_FILE, experiments_db)
        
        return jsonify(build_experiment_response(new_experiment)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/experiments/<exp_id>', methods=['GET'])
@login_required
def get_experiment(exp_id):
    """Get a specific experiment"""
    if exp_id not in experiments_db:
        return jsonify({'error': 'Experiment not found'}), 404
    return jsonify(build_experiment_response(experiments_db[exp_id]))

@app.route('/api/experiments/<exp_id>', methods=['PUT'])
@login_required
def update_experiment(exp_id):
    """Update experiment"""
    try:
        if exp_id not in experiments_db:
            return jsonify({'error': 'Experiment not found'}), 404
        
        data = request.get_json()
        
        if 'name' in data:
            experiments_db[exp_id]['name'] = data['name']
        
        if 'category' in data:
            # Convert category name to ID
            category_name = data['category']
            category_id = get_category_id_by_name(category_name)
            experiments_db[exp_id]['category'] = category_id
        
        if 'trials' in data:
            experiments_db[exp_id]['trials'] = max(1, int(data['trials']))
        
        if 'grade' in data:
            experiments_db[exp_id]['grade'] = data['grade']
        
        save_json_file(EXPERIMENTS_FILE, experiments_db)
        return jsonify(build_experiment_response(experiments_db[exp_id]))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/experiments/<exp_id>', methods=['DELETE'])
@login_required
def delete_experiment(exp_id):
    """Delete an experiment"""
    try:
        if exp_id not in experiments_db:
            return jsonify({'error': 'Experiment not found'}), 404
        
        del experiments_db[exp_id]
        save_json_file(EXPERIMENTS_FILE, experiments_db)
        return jsonify({'message': 'Experiment deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== ITEM ROUTES ====================
# Replace the add_item route
@app.route('/api/experiments/<exp_id>/items', methods=['POST'])
@login_required
def add_item(exp_id):
    """Add item to experiment"""
    try:
        if exp_id not in experiments_db:
            return jsonify({'error': 'Experiment not found'}), 404
        
        data = request.get_json()
        item_name = data.get('name', '').strip()
        
        if not item_name:
            return jsonify({'error': 'Item name is required'}), 400
        
        # Check if item already exists in this experiment (by name, case-insensitive)
        experiment = experiments_db[exp_id]
        for exp_item in experiment.get('items', []):
            existing_item = get_item_by_id(exp_item['id'])
            if existing_item and existing_item['name'].lower() == item_name.lower():
                return jsonify({'error': f'Item "{item_name}" already exists in this experiment'}), 400
        
        # Check if item already exists in items database (by name)
        item_id = None
        for item in items_data['items']:
            if item['name'].lower() == item_name.lower():
                item_id = item['id']
                # Update existing item's details
                item['price_per_unit'] = data.get('price', item['price_per_unit'])
                item['unit'] = data.get('unit', item['unit'])
                item['category'] = data.get('category', item.get('category', 'consumable'))
                save_json_file(ITEMS_FILE, items_data)
                break
        
        # If item doesn't exist, create new item in items database
        if not item_id:
            max_num = 0
            for item in items_data['items']:
                try:
                    num = int(item['id'].replace('ITM', ''))
                    max_num = max(max_num, num)
                except:
                    pass
            item_id = f"ITM{max_num + 1:03d}"
            
            new_item = {
                'id': item_id,
                'name': item_name,
                'price_per_unit': data.get('price', 0),
                'unit': data.get('unit', 'ml'),
                'category': data.get('category', 'consumable')
            }
            
            items_data['items'].append(new_item)
            save_json_file(ITEMS_FILE, items_data)
        
        # Add item reference to experiment
        exp_item = {
            'id': item_id,
            'quantity': data.get('quantity', 1)
        }
        
        experiments_db[exp_id]['items'].append(exp_item)
        save_json_file(EXPERIMENTS_FILE, experiments_db)
        
        # Return full item details
        item_details = get_item_by_id(item_id)
        return jsonify({
            'id': item_id,
            'name': item_details['name'],
            'quantity': exp_item['quantity'],
            'unit': item_details['unit'],
            'price': item_details['price_per_unit'],
            'category': item_details.get('category', 'consumable')
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    return jsonify({'message': 'Item added successfully'}), 201


@app.route('/api/experiments/<exp_id>/items/<item_id>', methods=['PUT'])
@login_required
def update_item(exp_id, item_id):
    """Update an item in experiment"""
    try:
        if exp_id not in experiments_db:
            return jsonify({'error': 'Experiment not found'}), 404
        
        experiment = experiments_db[exp_id]
        item_idx = next((i for i, item in enumerate(experiment['items']) if item['id'] == item_id), None)
        
        if item_idx is None:
            return jsonify({'error': 'Item not found in experiment'}), 404
        
        data = request.get_json()
        
        # Update quantity in experiment
        if 'quantity' in data:
            experiment['items'][item_idx]['quantity'] = data['quantity']
        
        # Update item details in items database
        for item in items_data['items']:
            if item['id'] == item_id:
                if 'name' in data:
                    item['name'] = data['name']
                if 'price' in data:
                    item['price_per_unit'] = data['price']
                if 'unit' in data:
                    item['unit'] = data['unit']
                if 'category' in data:
                    item['category'] = data['category']

                save_json_file(ITEMS_FILE, items_data)
                break
        
        save_json_file(EXPERIMENTS_FILE, experiments_db)
        
        
        # Return full item details
        item_details = get_item_by_id(item_id)
        return jsonify({
            'id': item_id,
            'name': item_details['name'],
            'quantity': experiment['items'][item_idx]['quantity'],
            'unit': item_details['unit'],
            'price': item_details['price_per_unit'],
            'category': item_details.get('category', 'consumable')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/experiments/<exp_id>/items/<item_id>', methods=['DELETE'])
@login_required
def delete_item(exp_id, item_id):
    """Delete an item from experiment"""
    try:
        if exp_id not in experiments_db:
            return jsonify({'error': 'Experiment not found'}), 404
        
        experiment = experiments_db[exp_id]
        original_length = len(experiment['items'])
        experiment['items'] = [item for item in experiment['items'] if item['id'] != item_id]
        
        if len(experiment['items']) == original_length:
            return jsonify({'error': 'Item not found'}), 404
        
        save_json_file(EXPERIMENTS_FILE, experiments_db)
        return jsonify({'message': 'Item deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/items/<item_id>/price', methods=['PUT'])
@login_required
def update_item_price(item_id):
    """Update item price"""
    try:
        data = request.get_json()
        new_price = data.get('price')
        
        if new_price is None:
            return jsonify({'error': 'Price is required'}), 400
        
        try:
            new_price = float(new_price)
            if new_price < 0:
                return jsonify({'error': 'Price cannot be negative'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid price value'}), 400
        
        # Find and update item
        item_found = False
        for item in items_data['items']:
            if item['id'] == item_id:
                old_price = item['price_per_unit']
                item['price_per_unit'] = new_price
                item_found = True
                break
        
        if not item_found:
            return jsonify({'error': 'Item not found'}), 404
        
        save_json_file(ITEMS_FILE, items_data)
        
        return jsonify({
            'message': 'Price updated successfully',
            'item_id': item_id,
            'old_price': old_price,
            'new_price': new_price
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

# ==================== CALCULATION ROUTES ====================
@app.route('/api/calculate', methods=['POST'])
@login_required
def calculate_costs():
    """Calculate costs for selected experiments"""
    try:
        data = request.get_json()
        selected_exp_ids = data.get('experiment_ids', [])
        item_usage_type = data.get('item_usage_type', {})
        item_custom_quantity = data.get('item_custom_quantity', {})
        
        if not selected_exp_ids:
            return jsonify({'error': 'No experiments selected'}), 400
        
        # Validate experiment IDs
        for exp_id in selected_exp_ids:
            if exp_id not in experiments_db:
                return jsonify({'error': f'Experiment {exp_id} not found'}), 404
        
        selected_experiments = [experiments_db[exp_id] for exp_id in selected_exp_ids]
        
        # Build item map
        item_map = {}
        
        for exp in selected_experiments:
            exp_name = exp['name']
            trials = exp.get('trials', 1)
            
            for exp_item in exp['items']:
                item_id = exp_item['id']
                item_details = get_item_by_id(item_id)
                
                if not item_details:
                    continue
                
                if item_id not in item_map:
                    item_map[item_id] = {
                        'name': item_details['name'],
                        'price': item_details['price_per_unit'],
                        'category': item_details.get('category', 'consumable'),
                        'unit': item_details['unit'],
                        'experiments': []
                    }
                
                item_map[item_id]['experiments'].append({
                    'exp_name': exp_name,
                    'quantity': exp_item['quantity'],
                    'trials': trials
                })
        
        # Categorize items
        common_items = []
        unique_items = []
        total_cost = 0
        
        for item_id, item_data in item_map.items():
            is_multi_exp = len(item_data['experiments']) > 1
            usage_type = item_usage_type.get(item_id, 'common' if is_multi_exp else 'unique')
            item_category = item_data['category']
            
            # Calculate required quantity based on category
            if item_category == 'non_consumable':
                # Equipment: count once (max quantity needed across all experiments)
                required_qty = max(e['quantity'] for e in item_data['experiments'])
            else:
                # Consumable: multiply by trials
                required_qty = sum(e['quantity'] * e['trials'] for e in item_data['experiments'])
            
            if usage_type == 'common' and item_id in item_custom_quantity:
                total_qty = max(required_qty, float(item_custom_quantity[item_id]))
            else:
                total_qty = required_qty
            
            item_cost = total_qty * item_data['price']
            total_cost += item_cost
            
            item_result = {
                'id': item_id,
                'name': item_data['name'],
                'price': item_data['price'],
                'category': item_data['category'],
                'unit': item_data['unit'],
                'experiments': item_data['experiments'],
                'total_quantity': total_qty,
                'required_quantity': required_qty,
                'total_cost': item_cost,
                'usage_type': usage_type
            }
            
            if usage_type == 'common' and is_multi_exp:
                common_items.append(item_result)
            else:
                unique_items.append(item_result)
        
        return jsonify({
            'common_items': common_items,
            'unique_items': unique_items,
            'total_cost': round(total_cost, 2),
            'selected_count': len(selected_experiments)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500   

# ==================== CATEGORIES ROUTE ====================

@app.route('/api/categories', methods=['GET'])
# @login_required
def get_categories():
    """Get all categories"""
    return jsonify(categories_data)


@app.route('/api/user-allowed-subject/<username>', methods=['GET'])
def get_user_allowed_subject(username):
    """
    Public endpoint: returns allowed subject for a username
    Used ONLY for login UI auto-fill
    """
    users = load_users()

    if username not in users:
        return jsonify({'exists': False}), 200

    return jsonify({
        'exists': True,
        'allowed_subject': users[username]['subject']
    }), 200



if __name__ == '__main__':
    serve(
        app,
        host="0.0.0.0",   # LAN access
        port=5000,
        threads=4         # Safe default
    )