# Frontend Architecture & Design Specification: Tirap Fuel Station Manager

## 1. Design System & Theme
**Style:** Utilitarian, high-speed data entry, minimalist light theme (adapted from Yu Studio CRM).
**Goal:** Sub-10 minute daily entry. Zero entrance animations, no heavy drop shadows, and no complex gradients. The interface must feel as fast and static as a paper ledger.
**Typography:** Inter (400, 500, 600 weights). 
**Color Palette:** Near black-and-white. 
- **Canvas/Cards:** `#FFFFFF`
- **Sidebar/Row Hover:** `#F5F7F9`
- **Text Primary:** `#0D0F14` (Headings, totals)
- **Text Secondary:** `#4E525A` (Labels, standard inputs)
- **Borders:** `#E2E4E6` (Used for all 1px hairlines)
- **Status Accents:** Used strictly for alerts. Red (`#FDE8E5` bg / `#B42318` text) for stock loss or negative total cash. Green (`#E2F4E6` bg / `#147A3A` text) for positive/stable metrics.

## 2. Layout Shell
**Container:** Horizontal flex layout (1440px target viewport).
**Sidebar (Left):** 280px fixed width, 1px right border (`#E2E4E6`). Collapses to a 72px icon rail on tablet (768px-1023px), and an off-canvas drawer on mobile (<768px).
- **Nav Items:** Dashboard, Daily Entry, Stock, Credit, Expenses, Cash Book, Reports, Settings.
- **Active State:** White pill background with a raised shadow (`0 2px 5px rgba(13,15,20,.08)`).
**Main Content (Right):** Flex-1 (computes to 1160px on desktop). Zero-gap vertical stack.
- **Header:** 67px height, 1px bottom border. Page title on left, utility actions (Print to PDF, Export CSV, Save) on right.

## 3. Core Components
**KPI Strip (Dashboard):** 
- Horizontal scrolling strip of 290x111px cards. Used for Net Cash Movement, Stock Variance, and Outstanding Dues.
**Data Tables (Credit Ledger, Reports, Cash Book):**
- Strictly use a `<colgroup>` element with fixed column widths (`table-layout: fixed`).
- Page padding (19px left, 18px right) must be folded *into* the first and last `<col>` widths to prevent flex overflow and horizontal drifting.
- 33px header row, 61.5px body rows. 1px bottom border on rows.
- Use a horizontal scroll wrapper (`overflow-x: auto`) for screens under 1280px, keeping the first column (e.g., Customer/Date) sticky-left.
**Forms & Data Entry (The "Daily Entry" View):**
- **Accessibility/Focus:** High-contrast focus states (`outline: 2px solid #17191F; outline-offset: 2px`) so the owner knows exactly which input is active.
- **Inputs:** 38px height, 10px radius, `#F5F7F9` background. No inner shadows.
- **Keyboard Flow:** Inputs must be ordered sequentially in the DOM to support rapid `Tab` key navigation (e.g., MS Nozzle 1 -> MS Nozzle 2 -> HSD Nozzle 1 -> R/F Litres).

## 4. State & Live Calculation
- **Centralized Math:** React state must handle Formulas F1 to F17 (from the PRD) live in the browser. If a user types a new closing meter, the "Net Cash Movement" must update instantly.
- **Paper Rounding Mode:** The UI must visually round fuel amounts, R/F values, and stock values down to the whole rupee (as per PRD settings), while preserving exact paise in the background state.
