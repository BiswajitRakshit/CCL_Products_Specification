# Laboratory Experiment Cost Estimator v2.0

A web-based application to estimate total costs of laboratory experiments with **item-level selection** and **multiple trials support**.

## 🎯 New Features (v2.0)

✨ **Item Selection** - Deselect unwanted items from experiments  
🔢 **Number of Trials** - Specify how many times each experiment will be performed  
📊 **Detailed Breakdown** - See quantity calculations per experiment and trial  
🎛️ **Expandable Cards** - View and customize items for each experiment  
⚡ **Smart Aggregation** - Automatic quantity calculation based on trials and usage type

## 📁 Project Structure

```
lab_cost_estimator/
├── app.py                  # Flask backend (Enhanced)
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html         # Main UI template (Enhanced)
└── static/
    ├── style.css          # Styling (Enhanced)
    └── script.js          # Frontend logic (Enhanced)
```

## 🛠️ Installation & Setup

### 1. Create Project Directory

```bash
mkdir lab_cost_estimator
cd lab_cost_estimator
```

### 2. Create Virtual Environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Create Project Structure

```bash
mkdir templates
mkdir static
```

Place the files:
- `app.py` → root directory
- `index.html` → templates/
- `style.css` → static/
- `script.js` → static/
- `requirements.txt` → root directory

### 5. Run the Application

```bash
python app.py
```

The application will start on `http://localhost:5000`

## 🎮 How to Use

### Step 1: Select Experiments
1. Check the checkbox next to experiment names
2. Click experiment card to expand and view items

### Step 2: Configure Trials
1. Set number of trials (1-99) for each experiment
2. Quantities will be multiplied by trials automatically

### Step 3: Customize Items
1. Click the expand arrow (▼) to view items
2. Deselect items you don't need
3. Use "Select All" / "Deselect All" for quick changes

### Step 4: Calculate Cost
1. Click "Calculate Total Cost" button
2. View results with detailed breakdown
3. Export procurement list if needed

## 📖 API Documentation

### Endpoints

#### 1. GET `/api/experiments`
Returns list of all experiments with their items.

**Response:**
```json
[
  {
    "experiment_id": "EXP001",
    "experiment_name": "DNA Extraction",
    "items_count": 5,
    "items": [
      {
        "item_id": "ITM001",
        "item_name": "Ethanol 95%",
        "category": "consumable",
        "usage_type": "common",
        "quantity_per_experiment": 50,
        "unit_price": 2.5
      }
    ]
  }
]
```

#### 2. POST `/api/estimate`
Calculate cost for selected experiments with trials and item selection.

**Request:**
```json
{
  "experiments": [
    {
      "experiment_id": "EXP001",
      "trials": 3,
      "selected_items": ["ITM001", "ITM002", "ITM004"]
    },
    {
      "experiment_id": "EXP002",
      "trials": 2,
      "selected_items": ["ITM002", "ITM007", "ITM009"]
    }
  ]
}
```

**Response:**
```json
{
  "total_cost": 18425.00,
  "experiments_count": 2,
  "total_trials": 5,
  "items": [
    {
      "item_id": "ITM001",
      "item_name": "Ethanol 95%",
      "category": "consumable",
      "usage_type": "common",
      "final_quantity": 150,
      "unit_price": 2.5,
      "total_price": 375.0,
      "experiment_details": [
        {
          "experiment_name": "DNA Extraction",
          "trials": 3,
          "quantity": 150
        }
      ]
    }
  ]
}
```

## 🧮 Enhanced Business Logic

### Quantity Calculation Rules

| Category | Usage Type | Formula |
|----------|------------|---------|
| **Consumable** | Common | Qty × Trials (per experiment, then sum) |
| **Consumable** | Unique | Qty × Trials (per experiment, then sum) |
| **Non-Consumable** | Common | Max(all quantities) ← shared equipment |
| **Non-Consumable** | Unique | Qty × Trials (per experiment, then sum) |

### Example Scenarios

**Scenario 1: Consumable Item with Trials**
- Item: Micropipette Tips (Consumable, Unique)
- Experiment 1: 20 tips × 3 trials = 60 tips
- Experiment 2: 15 tips × 2 trials = 30 tips
- **Total Required: 90 tips** ✅

**Scenario 2: Common Equipment (No Multiplication)**
- Item: Microcentrifuge (Non-consumable, Common)
- Experiment 1: 1 unit × 3 trials = shared
- Experiment 2: 1 unit × 2 trials = shared
- **Total Required: 1 unit** (used across all experiments) 🔄

**Scenario 3: Unique Equipment with Trials**
- Item: Specialized Filter (Non-consumable, Unique)
- Experiment 1: 1 unit × 3 trials = 3 units
- **Total Required: 3 units** (separate for each trial) ⭐

**Scenario 4: Deselected Items**
- If you deselect "Vortex Mixer" from Experiment 1
- It won't appear in calculations or procurement list
- Saves cost if equipment is not actually needed ❌

## 📊 Results Breakdown

### Detailed View
Click "📊 Details" button on any item to see:
- Which experiments use it
- Number of trials per experiment
- Quantity breakdown per experiment
- Notes (e.g., "Shared equipment")

### Export Format
The exported text file includes:
```
=== LABORATORY PROCUREMENT LIST ===

Date: 2025-12-16
Experiments Selected: 2
Total Trials: 5
Total Estimated Cost: ₹18,425.00

--- CONSUMABLES ---

Ethanol 95% (ITM001)
  Final Quantity: 150
  Unit Price: ₹2.50
  Total: ₹375.00
  Usage Type: common
  Breakdown:
    - DNA Extraction: 3 trial(s) = 150

--- NON-CONSUMABLES (EQUIPMENT) ---

Microcentrifuge (ITM004)
  Final Quantity: 1
  Unit Price: ₹5,000.00
  Total: ₹5,000.00
  Usage Type: common
  Used in:
    - DNA Extraction: 3 trial(s) (Shared equipment)
    - PCR Amplification: 2 trial(s) (Shared equipment)
```

## 🎨 UI Features

### Experiment Cards
- ✅ Checkbox to select/deselect experiment
- 🔢 Number input for trials (1-99)
- ▼ Expand arrow to view items
- 🎨 Visual feedback for selection

### Item Lists
- Individual checkboxes per item
- Quick "Select All" / "Deselect All" buttons
- Color-coded badges:
  - 📦 Yellow = Consumable
  - 🔧 Blue = Non-consumable
  - 🔄 Blue = Common usage
  - ⭐ Pink = Unique usage

### Results Display
- Summary cards with key metrics
- Separate sections for consumables/equipment
- Detailed breakdown per item
- Export to text file

## 🚨 Validation & Error Handling

The application validates:
- ✅ At least one experiment selected
- ✅ Trials must be between 1-99
- ✅ Valid experiment IDs
- ✅ At least one item selected per experiment
- ✅ Proper data structure in requests

Error messages are displayed for:
- Empty selections
- Invalid experiment IDs
- Server communication issues
- Invalid trial numbers

## 🔧 Customization

### Adding New Experiments

Edit `SAMPLE_EXPERIMENTS` in `app.py`:

```python
SAMPLE_EXPERIMENTS.append(
    Experiment(
        experiment_id="EXP006",
        experiment_name="Your New Experiment",
        items_required=[
            Item("ITM023", "New Item", "consumable", "unique", 15, 25.0),
            # Add more items...
        ]
    )
)
```

### Changing Trial Limits

In `script.js` and `index.html`, modify:
```javascript
min="1"
max="99"  // Change this to your desired maximum
```

### Custom Aggregation Rules

Modify `calculate_cost` method in `CostEstimationService` class in `app.py` to implement custom logic.

## 🧪 Testing Examples

### Test Case 1: Basic Selection
1. Select "DNA Extraction" with 2 trials
2. Keep all items selected
3. Expected: All items × 2 (except common equipment stays at 1)

### Test Case 2: Item Deselection
1. Select "PCR Amplification" with 1 trial
2. Deselect "Thermal Cycler"
3. Expected: Cost reduced by ₹8,000

### Test Case 3: Multiple Experiments
1. Select "DNA Extraction" (3 trials)
2. Select "PCR Amplification" (2 trials)
3. Note: Microcentrifuge appears only once (common equipment)
4. Note: Micropipette Tips quantity adds up from both

### Test Case 4: All Deselected
1. Select experiment
2. Click "Deselect All" items
3. Expected: Validation error (no items selected)

## 🌐 Browser Compatibility

✅ Chrome 90+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Edge 90+  

## 📱 Mobile Responsive

The application is fully responsive:
- Stacked layout on mobile
- Touch-friendly controls
- Readable text sizes
- Scrollable tables

## 🔐 Security Considerations

- Input validation on both frontend and backend
- SQL injection protection (using dataclasses, not raw SQL)
- XSS prevention (proper escaping)
- CORS configured for same-origin

## 📈 Performance

- Efficient state management
- Minimal re-renders
- Optimized CSS animations
- Lightweight JavaScript

## 🐛 Troubleshooting

### Issue: Calculate button stays disabled
- **Solution**: Ensure at least one experiment is checked

### Issue: Trials input not working
- **Solution**: Select the experiment first (check the checkbox)

### Issue: Items not showing
- **Solution**: Click the expand arrow (▼) on experiment card

### Issue: Cost seems wrong
- **Solution**: Click "Details" button to see breakdown per experiment

## 📝 Changelog

### Version 2.0 (Current)
- ✨ Added item-level selection/deselection
- ✨ Added number of trials per experiment
- ✨ Enhanced business logic for trials multiplication
- ✨ Expandable experiment cards
- ✨ Detailed breakdown view
- 🎨 Improved UI with better visual feedback
- 📊 Enhanced export format with trial information

### Version 1.0
- Basic experiment selection
- Cost calculation
- Procurement list generation

## 🤝 Contributing

To extend functionality:
1. Update data models in `app.py`
2. Modify business logic in `CostEstimationService`
3. Enhance UI in `index.html` and `style.css`
4. Update frontend logic in `script.js`

## 📞 Support

For issues or questions:
1. Check this documentation
2. Review code comments
3. Test with provided examples

---

**Version:** 2.0.0  
**Last Updated:** December 2025  
**License:** Educational Use#   C C L _ P r o d u c t s _ S p e c i f i c a t i o n  
 