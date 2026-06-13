# School Management System Integration (SMSI)

The School Management System Integration (SMSI) is the centralized data architecture that bridges student-level transactional data from **Engage** and **SIMS** into the **TM1 (IBM Cognos)** analytics environment for Taylor's Schools.

## System Architecture
- **Source Systems:** Engage (Primary for most schools) and SIMS (specifically for [[Garden International School]]).
- **Analytics Platform:** TM1 (IBM Cognos) using the FDW (Financial Data Warehouse) infrastructure.
- **Reporting Interface:** IBM Cognos Analytics Dashboard.

## Core Data Cubes
- **Analysis Cubes:**
    - `sch_student_main`: Focuses on current student population, demographics, and [[Admissions & Operations|Attrition]].
    - `sch_student_prospective`: Tracks the inquiry-to-enrollment funnel, including marketing channels and enquiry modes.
- **Staging Cubes:**
    - `sch_stg_FDW_Main`: Direct mirror of Engage SMS data.
    - `sch_stg_GIS_AllApplications`: Direct mirror of SIMS SMS data for GIS.
- **Academic Calendar:** `sch_ACADYearTerm` (Normalizes dates across schools).

## Governance & Training
The system is governed by the Taylor's School Office (TSO) Systems & Methods department. Standardized training and measure definitions are maintained to ensure group-wide data integrity.

---
Source: [[Taylors_SMSI _User Training Manual_v1.2.pdf]]
Related: [[Admissions & Operations]], [[Market Intelligence]], [[Taylor's International School]], [[Garden International School]]

## Update (May 13, 2026): E-Wallet Vendor Evaluation
- **Vircle Integration:** In a recent vendor evaluation, Vircle scored 87% (vs CALMS at 58%) as the preferred e-wallet provider. Its selection is driven by zero annual maintenance, BNM compliance via Fasspay, and a rapid 40-day deployment capability. This modernizes parent payment channels and serves as an external financial interface parallel to internal SMS architectures. See [[Admissions & Operations]] for full metrics.
- **Source:** [[eWallet Evaluation Matrix - Google Sheets.pdf]]


## Project C: Digitalization to Improve Efficiency (2021)
As a response to COVID-19 and to improve pre- and post-admission operations, Taylor's Schools launched **Project C**, which focused on broad digitalization across operations:
- **CRM Integration:** Deployment of Digistorm to improve lead nurturing, tracking, and funnel conversions.
- **Financial & Approval Automation:** Implementation of CALMS for direct debit fee instalment collections, and Kissflow for e-approvals and governance.
- **IT & Facilities:** Rollout of ServiceDesk Plus as a unified helpdesk.
- **Future Integration:** Plans mapped for SMS integration with CALMS for billing, and Engage-Sage integration for reconciliation.
These efforts reduced manual processes and improved the overall ecosystem for both staff and parent engagement. Links to [[Admissions & Operations]].
\n### Update (May 14, 2026): Vircle Merchant Framework\n- **Mechanism:** Formal merchant terms and conditions (via Fasspay) establish the legal framework for Taylor's Schools to operate as a Vircle merchant entity. This enables campus-wide digital payments for canteens and bookstores, governed by BNM compliance standards. Linked to [[Vircle]] and [[Admissions & Operations]].
