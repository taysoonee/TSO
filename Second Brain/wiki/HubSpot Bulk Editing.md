---
summary: "Guide and playbook for bulk editing, importing/exporting, and managing drop-down properties (like Agent Names) in HubSpot."
---

# HubSpot Bulk Editing & Import Playbook

To ensure data integrity across Taylor's Schools HubSpot portals, the admissions and operations teams must follow specific protocols when bulk-editing records, modifying properties, or importing datasets. 

For workflow details, see [[HubSpot Admissions Workflow]]. For personnel roles, see [[Admissions & Operations]].

---

## 1. Modifying Drop-down Properties (e.g., Agent Names)
When updating drop-down values (such as correcting misspelled Admissions Agent names or adding new ones):

1.  **Create the Correct Option First:** In property settings, add the new/corrected value. Do not delete the old value yet.
2.  **Bulk Edit Existing Records:**
    *   **For Deals:** Go to the Deals view -> Switch to *All Pipelines* -> Use *Advanced Filters* to find records with the old value -> Check the checkbox to select all -> Click **Edit** -> Select the property -> Choose the corrected value -> Click **Update**.
    *   **For Contacts:** Go to the Contacts view -> Use *Advanced Filters* -> Select all matching records -> Click **Edit** -> Map to the corrected property value.
3.  **Delete the Obsolete Option:** Verify in property settings that the old value has exactly `0` records associated with it, then delete it.

> [!WARNING]
> **Form Option Attrition:** When editing HubSpot Forms, do not remove (trash) obsolete options on the left-hand options pane if they have historical submissions. Instead, use the **Add Option** button to introduce new ones. Accidentally removing active values can break form routing and clean up existing submissions.

---

## 2. Bulk Data Ingestion (Import/Export Protocols)
Updating hundreds of records at once requires exporting data first to capture HubSpot's internal matching keys.

### The Export Phase
1.  Customize the HubSpot view to display the exact properties you want to update (e.g., `Enrollment Date`, `Deal Stage`).
2.  Filter the dataset to a minimal subset (e.g., by school campus, intake year, or specific deal stages) to avoid exporting unnecessary rows.
3.  Click **Export**. In the export options, **uncheck "Include associated record name"** unless you actively need to update parent/child associations (this keeps the dataset clean and lightweight).

### Preparing the CSV for Import
1.  **Retain the Record ID:** HubSpot relies on the internal **Record ID** (e.g., Deal ID or Contact ID) to match rows. Ensure this column is untouched.
2.  **Delete Unchanged Columns:** Keep only the **Record ID** column and the specific columns you intend to overwrite (e.g., `Enrollment Date`). Delete all other columns (like `Deal Name` or `Owner`) to prevent accidental overwrites.
3.  **Save as CSV:** Save the file in a standard CSV or Excel format.

### The Import Phase (Advanced Import)
1.  Go to the Deals or Contacts page -> Click **Import** (requires specific import permissions).
2.  Select **Advanced Import** -> Choose **Deals** (or the target object).
3.  Choose **Update existing deals** (using Record ID as the matching anchor).
4.  **Map Properties:** Verify that the spreadsheet column headers map to the correct HubSpot properties. Deal ID must map to `Deal information: Record ID`.
5.  **Resolve Mapped Errors (Yellow/Red Flags):**
    *   If a drop-down value on the spreadsheet doesn't match HubSpot (e.g., `NAN` or spelling differences), select the matching drop-down value from the dropdown menu, or select *Don't import this value* (leaving it empty).
    *   **Don't Overwrite Option:** If you only want to fill empty fields and preserve existing values, check the **Don't override** checkbox for that column.
6.  **Unmapped Columns:** Select *Don't import data in un-mapped columns* to ignore empty helper columns.

> [!IMPORTANT]
> **Reversal & Undo Limits:** HubSpot changes made via bulk imports are permanent and **cannot be reversed with an 'Undo' button** (unless utilizing the HubSpot import revert beta feature within 30 days). If data is wrongly mapped, a custom HubSpot workflow must be run to copy backup properties back to the primary fields.

---
Source: [[raw/K12_Archive/109. Hubspot/Hubspot - Bulk Editing.md]]
