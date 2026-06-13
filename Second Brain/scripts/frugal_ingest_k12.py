#!/usr/bin/env python3
import asyncio
import datetime
import os
import re
import subprocess
import sys
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from google.antigravity import Agent, LocalAgentConfig
from google.antigravity.hooks import policy
from google.antigravity.types import Document, Image

# Standard Compliance: UK English & TSO Career Sanitisation

class UsageTracker:
    def __init__(self, budget_myr=10.0):
        self.totals = {"prompt": 0, "candidates": 0, "total": 0}
        self.by_model = {}
        self.budget_myr = budget_myr
        # Pricing per 1M tokens (USD) - Conservative estimates
        self.pricing = {
            "gemini-3.1-flash-lite": {"prompt": 0.075, "candidates": 0.30},
            "gemini-3.1-pro-preview": {"prompt": 3.50, "candidates": 10.50},
            "default": {"prompt": 0.10, "candidates": 0.40}
        }
        self.usd_to_myr = 4.5 # TSO Priority Sell/Buy corridor median

    def add(self, model, usage):
        self.totals["prompt"] += usage.prompt_token_count
        self.totals["candidates"] += usage.candidates_token_count
        self.totals["total"] += usage.total_token_count
        
        if model not in self.by_model:
            self.by_model[model] = {"prompt": 0, "candidates": 0, "total": 0}
        self.by_model[model]["prompt"] += usage.prompt_token_count
        self.by_model[model]["candidates"] += usage.candidates_token_count
        self.by_model[model]["total"] += usage.total_token_count

    def get_current_cost_myr(self):
        total_usd = 0
        for model, usage in self.by_model.items():
            price = self.pricing.get(model, self.pricing["default"])
            total_usd += (usage["prompt"] / 1_000_000) * price["prompt"]
            total_usd += (usage["candidates"] / 1_000_000) * price["candidates"]
        return total_usd * self.usd_to_myr

    def is_over_budget(self):
        return self.get_current_cost_myr() >= self.budget_myr

    def report(self):
        cost = self.get_current_cost_myr()
        print("\n📊 RUN COST AUDIT:")
        print(f"   BUDGET LIMIT: RM {self.budget_myr:.2f}")
        print(f"   ESTIMATED COST: RM {cost:.2f} ({'🛑 BUDGET HIT' if cost >= self.budget_myr else '✅ WITHIN BUDGET'})")
        for model, usage in self.by_model.items():
            print(f"   Model: {model:25} | P:{usage['prompt']:7} C:{usage['candidates']:7} T:{usage['total']:7}")
        print(f"   {'TOTAL':25} | P:{self.totals['prompt']:7} C:{self.totals['candidates']:7} T:{self.totals['total']:7}\n")

global_tracker = UsageTracker()

def load_cron_env():
    """Load API keys from .env if running in a non-interactive shell."""
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent # Root of Second Brain
    env_path = project_root / ".env"

    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:].strip()
                if "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v

def sanitize_content(text: str) -> str:
    """Rigorous regex-based sanitisation to prevent any leakage of private data."""
    replacements = {
        r"\bCatherine Tan Hwei Ping\b": "my spouse",
        r"\bTan Hwei Ping\b": "my spouse",
        r"\bCatherine Tan\b": "my spouse",
        r"\bCat\b": "my spouse",
        r"\bXiao Ern\b": "my child",
        r"\bXE\b": "my child",
        r"\bHong Ern\b": "my child",
        r"\bHE\b": "my child",
        r"\bQian Ern\b": "my child",
        r"\bQE\b": "my child",
        r"\bVPR\s?5939\b": "[my primary vehicle plate]",
        r"\bCaffra\b": "my property",
        r"\bSeri Intan\b": "my property",
    }
    sanitized = text
    for pattern, replacement in replacements.items():
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
    return sanitized

async def ingest_batch(files, baseline_context, model_name="gemini-3.1-flash-lite", custom_prompt=None):
    """Processes a small batch of files using the specified model."""
    if not files:
        return ""

    # REMOVED TRUNCATION: Baseline context is now fully provided to prevent contextual blindness.
    prompt_parts = [f"BASELINE CONTEXT (Summary):\n{baseline_context}\n\nINPUT DOCUMENTS:"]
    
    for f in files:
        f_path = Path(f)
        ext = f_path.suffix.lower()
        # Use full path for the agent to ensure absolute uniqueness
        prompt_parts.append(f"\n--- SOURCE: {f_path} ---")
        
        if ext == '.pdf':
            prompt_parts.append(Document.from_file(str(f_path)))
        elif ext in ['.png', '.jpg', '.jpeg', '.webp']:
            prompt_parts.append(Image.from_file(str(f_path)))
        elif ext in ['.tif', '.tiff']:
            # Create temp PNG in the current safe temporary directory instead of the inbox
            temp_png = Path(f_path.name).with_suffix('.tmp.png')
            try:
                subprocess.run(['sips', '-s', 'format', 'png', str(f_path), '--out', str(temp_png)], check=True, capture_output=True)
                prompt_parts.append(Image.from_file(str(temp_png)))
            except Exception as e:
                print(f"❌ TIF error: {e}")
                continue
        else:
            try:
                with open(f_path, "r", encoding="utf-8") as f_in:
                    prompt_parts.append(f_in.read())
            except Exception:
                continue

    system_instruction = (
        "You are the TSO Data Extraction Agent.\n"
        "Output structured summary: {school_name, jurisdiction, financial_period, revenue, profit, student_count, fees, strategic_notes, archive_folder}\n"
        "CRITICAL: For 'archive_folder', use '78. Financial & Audited Reports/<Category>/<School>/<Year>'.\n"
        "Categories: 1 Local Schools/Tier-1 Schools, 1 Local Schools/Tier-2 Schools, 2 Singapore Schools, etc.\n"
        "Include [ARCHIVE: filename -> folder] tag where filename is the FULL Path provided. DO NOT use tools. Text only."
    )

    p = custom_prompt if custom_prompt else "Extract data. [ignoring loop detection]"
    prompt_parts.append(f"\n{p}")

    config = LocalAgentConfig(
        model=model_name,
        system_instructions=system_instruction,
        policies=[policy.allow_all()],
        workspace_folders=[] # Disable automatic workspace inference for Google Drive paths
    )

    async with Agent(config) as agent:
        response = await agent.chat(prompt_parts)
        text = await response.text()
        usage = agent.conversation.total_usage
        global_tracker.add(model_name, usage)
        return text

async def run_strategic_synthesis(extraction_results, baseline_context, tso_dir):
    """Uses Pro model to synthesise data into wiki updates AND stakeholder reports."""
    system_instruction = (
        "You are the Taylor's Schools Chief of Staff (Market Intelligence).\n"
        "Synthesise extraction into wiki updates and stakeholder briefs. UK English active.\n"
        "Output ONLY valid XML blocks:\n"
        "1. <updates><file path=\"wiki/Filename.md\">COMPLETE CONTENT</file></updates>\n"
        "TARGET HIERARCHY for [ARCHIVE]:\n"
        "78. Financial & Audited Reports/<Category>/<School>/<Year>\n"
        "Categories: 1 Local Schools/Tier-1 Schools, 1 Local Schools/Tier-2 Schools, 2 Singapore Schools, etc.\n"
        "Example: [ARCHIVE: 00001.tif -> 78. Financial & Audited Reports/1 Local Schools/Tier-1 Schools/Alice Smith/2014]\n"
        "Include [ARCHIVE: filename -> folder] for EVERY document processed.\n"
        "[ignoring loop detection]\n"
        "Report MUST include: Executive Summary, Operations/Admissions Brief, and Marketing Brief."
    )
    prompt = f"BASELINE CONTEXT:\n{baseline_context}\n\nEXTRACTED DATA:\n{extraction_results}\n\nPerform final strategic synthesis and generate stakeholder reports."
    config = LocalAgentConfig(
        model="gemini-3.1-pro-preview", 
        system_instructions=system_instruction, 
        policies=[policy.allow_all()],
        workspace_folders=[] # Disable automatic workspace inference
    )
    async with Agent(config) as agent:
        response = await agent.chat(prompt)
        text = await response.text()
        usage = agent.conversation.total_usage
        global_tracker.add("gemini-3.1-pro-preview", usage)
        
        # Process Wiki Updates
        sanitized = sanitize_content(text)
        file_blocks = re.findall(r'<file path="(.*?)">(.*?)</file>', sanitized, re.DOTALL)
        for rel_path, content in file_blocks:
            dest_path = tso_dir / rel_path.strip()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_path, "w", encoding="utf-8") as f_out: f_out.write(content.strip())
            print(f"✅ Wiki: {rel_path}")
            
        # Process Stakeholder Report
        report_match = re.search(r'<report path="(.*?)">(.*?)</report>', sanitized, re.DOTALL)
        if report_match:
            r_path, r_content = report_match.groups()
            # Replace YYYY-MM-DD with today's date if literal
            actual_date = datetime.datetime.now().strftime("%Y-%m-%d")
            r_path = r_path.replace("YYYY-MM-DD", actual_date)
            dest_path = tso_dir / r_path.strip()
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            with open(dest_path, "w", encoding="utf-8") as f_out: f_out.write(r_content.strip())
            print(f"✅ Report: {r_path}")
            
        return text

async def process_elephant(f_path, baseline_context, archive_dir, tso_dir):
    """Splits a massive PDF into 20-page chunks and processes them sequentially."""
    print(f"🐘 Elephant Detected: {f_path.name} ({f_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    try:
        reader = PdfReader(f_path)
        total_pages = len(reader.pages)
        chunk_size = 20
        temp_chunks = []
        all_chunk_extractions = ""
        
        print(f"   -> Splitting {total_pages} pages into {chunk_size}-page chunks...")
        
        for i in range(0, total_pages, chunk_size):
            writer = PdfWriter()
            chunk_end = min(i + chunk_size, total_pages)
            for page_num in range(i, chunk_end):
                writer.add_page(reader.pages[page_num])
            
            chunk_path = f_path.parent / f"{f_path.stem}_chunk_{i//chunk_size}.tmp.pdf"
            with open(chunk_path, "wb") as f_out:
                writer.write(f_out)
            temp_chunks.append(chunk_path)
            
            print(f"   -> Extracting Chunk {len(temp_chunks)} ({i+1}-{chunk_end})...")
            try:
                # Use Flash-Lite for elephant chunks for extreme cost efficiency. 
                # Flash-Lite is 95% cheaper and sufficient for high-fidelity OCR/Extraction.
                chunk_extraction = await asyncio.wait_for(
                    ingest_batch([chunk_path], baseline_context, model_name="gemini-3.1-flash-lite", 
                                 custom_prompt="Deep Data Extraction: Capture every financial table, enrolment stat, and strategic mention in this specific chunk."), 
                    timeout=180
                )
                all_chunk_extractions += f"\n--- {f_path.name} (Pages {i+1}-{chunk_end}) ---\n{chunk_extraction}\n"
            except Exception as e:
                print(f"      ⚠️ Chunk failed: {e}")
            finally:
                if chunk_path.exists(): chunk_path.unlink()

        if all_chunk_extractions:
            print(f"   -> Performing Reduction Synthesis for {f_path.name}...")
            # Unified synthesis call
            await run_strategic_synthesis(all_chunk_extractions, baseline_context, tso_dir)
            
            # Archive the original elephant
            folder_match = re.search(r'\[ARCHIVE: .*? -> (.*?)\]', all_chunk_extractions)
            folder = folder_match.group(1).strip().lstrip("/") if folder_match else "Archive_Large_Reports"
            dest_folder = archive_dir / folder
            dest_folder.mkdir(parents=True, exist_ok=True)
            target = dest_folder / f_path.name
            if target.exists(): target = dest_folder / f"{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{f_path.name}"
            f_path.rename(target)
            print(f"📦 Elephant Archived: {f_path.name}")
            return True
    except Exception as e:
        print(f"❌ Elephant processing crashed: {e}")
    return False

async def main():
    print("📋 Initialising Environment...")
    load_cron_env()
    tso_dir = Path(__file__).resolve().parent.parent
    # Accept inbox path and budget from command line - FORCE ABSOLUTE PATHS
    inbox_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (tso_dir / "raw" / "K12_Inbox").resolve()
    budget_limit = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
    
    print(f"💰 Budget: RM {budget_limit:.2f}")
    global global_tracker
    global_tracker = UsageTracker(budget_myr=budget_limit)
    
    archive_dir = (tso_dir / "raw" / "K12_Archive").resolve()
    quarantine_dir = (tso_dir / "raw" / "K12_Quarantine").resolve()
    
    print("📖 Reading Baseline Context...")
    baseline = ""
    for f_name in ["SITREP.md", "The Living Ledger.md", "GEMINI.md"]:
        f_path = tso_dir / f_name
        if f_path.exists():
            with open(f_path, "r", encoding="utf-8") as f: baseline += f"\n--- {f_name} ---\n{f.read()}\n"

    print(f"📂 Inventorying Inbox: {inbox_dir.name}...")

    # STREAMING FILE LISTING: subprocess find blocks until completion, which is too slow for 10k+ files on Google Drive.
    # We use os.walk to stream files and stop immediately at our limit.
    files = []
    print("🚦 Scanning for documents (streaming)...")
    try:
        import os
        for root, dirs, filenames in os.walk(inbox_dir):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for f_name in filenames:
                if f_name.startswith(".") or f_name.startswith("~$") or ".tmp" in f_name:
                    continue
                f_path = Path(root) / f_name
                if f_path.is_file():
                    files.append(f_path)
                if len(files) >= 5000: break
            if len(files) >= 5000: break
    except Exception as e:
        print(f"⚠️ Listing failed: {e}")

    if not files:
        print("✅ Inbox empty.")
        return

    # BYPASS SDK ERRORS: The SDK automatically adds the CWD as a workspace folder.
    # To avoid 'hidden URI' errors on Google Drive or 'permission denied' in /tmp,
    # we use a dedicated temporary directory as our execution context.
    import tempfile
    with tempfile.TemporaryDirectory() as safe_cwd:
        os.chdir(safe_cwd)

        # Phase 1: Elephant Hunt (Process ONE elephant per run to avoid tool timeouts)
        elephants = [f for f in files if f.stat().st_size > 15 * 1024 * 1024]
        if elephants:
            print(f"🐘 {len(elephants)} elephants in inbox. Starting hunt...")
            for elephant in elephants:
                if global_tracker.is_over_budget():
                    print("🛑 Budget cap reached during elephant hunt.")
                    break
                if await process_elephant(elephant, baseline, archive_dir, tso_dir):
                    print(f"📦 Elephant Hunt Successful: {elephant.name}")
                    global_tracker.report()
                else:
                    print(f"⚠️ Elephant hunt failed: {elephant.name}")
            
            # Continue to batches if budget remains
            if global_tracker.is_over_budget():
                return

        # Phase 2: Standard Loop
        print(f"🚦 {len(files)} files. Massive loop starting...")
        path_map = {str(f.relative_to(inbox_dir)): f for f in files}
        BATCH_SIZE, MAX_BATCHES, archived_files, all_extractions = 15, 200, set(), ""
        
        for i in range(0, len(files), BATCH_SIZE):
            if (i // BATCH_SIZE) >= MAX_BATCHES: break
            if global_tracker.is_over_budget():
                print(f"🛑 Budget Cap Reached (RM {global_tracker.get_current_cost_myr():.2f}). Stopping ingest.")
                break
            
            batch_files = files[i:i+BATCH_SIZE]
            print(f"🧠 [Flash-Lite] Batch {(i//BATCH_SIZE)+1}...")
            try:
                raw_output = await asyncio.wait_for(ingest_batch(batch_files, baseline), timeout=90)
                all_extractions += f"\n{raw_output}\n"
                archive_matches = re.findall(r'\[ARCHIVE: (.*?) -> (.*?)\]', raw_output)
                for rel_f_path, folder in archive_matches:
                    rel_f_path = rel_f_path.strip()
                    if rel_f_path in path_map:
                        src = path_map[rel_f_path]
                        if src.exists():
                            dest_folder = archive_dir / folder.strip().lstrip("/")
                            dest_folder.mkdir(parents=True, exist_ok=True)
                            target = dest_folder / src.name
                            if target.exists(): target = dest_folder / f"{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{src.name}"
                            src.rename(target)
                            archived_files.add(rel_f_path)
                            print(f"📦 Archived: {rel_f_path}")
            except Exception as e: print(f"⚠️ Batch failed: {e}")

        if all_extractions:
            print("🧠 [Pro] Synthesis & Reporting...")
            try:
                await run_strategic_synthesis(all_extractions, baseline, tso_dir)
            except Exception as e: print(f"⚠️ Synthesis failed: {e}")

        # Standard Cleanup
        for f in files[:min(len(files), BATCH_SIZE * MAX_BATCHES)]:
            rel_path = str(f.relative_to(inbox_dir))
            if rel_path not in archived_files and f.exists() and not f.name.endswith(".tmp.pdf"):
                try:
                    # PRESERVE STRUCTURE: Quarantine by original relative path
                    dest = quarantine_dir / rel_path
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if dest.exists(): dest = dest.parent / f"{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{f.name}"
                    f.rename(dest)
                except Exception: pass
        
        for f in inbox_dir.rglob("*.tmp.*"):
            try: f.unlink()
            except Exception: pass
        
        global_tracker.report()
        print("🏁 Run Completed.")

if __name__ == "__main__":
    asyncio.run(main())
