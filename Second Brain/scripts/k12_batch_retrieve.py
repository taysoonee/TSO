#!/usr/bin/env python3
import os
import sys
import json
import re
import shutil
import datetime
import time
from pathlib import Path
from google import genai
from google.genai import types

def update_markdown_status(tso_dir, registry, inbox_dir):
    status_path = Path("/Users/soonee.tay/Library/CloudStorage/GoogleDrive-taysoonee@gmail.com/My Drive/1. Tay/Obsidian/Second Brain/wiki/concepts/K12_Batch_Status.md")
    
    # Count files left in inbox (excluding hidden/tmp)
    inbox_count = 0
    if inbox_dir.exists():
        for root, _, filenames in os.walk(inbox_dir):
            for f in filenames:
                if not f.startswith(".") and not f.startswith("~$") and ".tmp" not in f:
                    inbox_count += 1
                    
    active_jobs = []
    completed_jobs = []
    
    # Sort registry keys by submitted_at descending to show latest first
    sorted_jobs = sorted(
        registry.items(),
        key=lambda x: x[1].get("submitted_at", ""),
        reverse=True
    )
    
    for job_id, details in sorted_jobs:
        status = details.get("status")
        sub_time = details.get("submitted_at", "")
        file_count = sum(len(paths) for paths in details.get("custom_id_to_files", {}).values())
        short_id = job_id.split('/')[-1]
        
        row = f"| `{short_id}` | {sub_time[:19].replace('T', ' ')} | {file_count} | {status} |"
        if status == "RUNNING":
            active_jobs.append(row)
        else:
            completed_jobs.append(row)
            
    markdown = (
        "---\n"
        "summary: \"Real-time status of K-12 Batch API ingestion jobs.\"\n"
        "---\n\n"
        "# K-12 Cloud Ingestion Status\n\n"
        f"🟢 **Files remaining in K12_Inbox**: **{inbox_count}** files\n\n"
        "### ⏳ Active Cloud Jobs (RUNNING)\n"
        "| Job ID | Submitted At | File Count | Status |\n"
        "| :--- | :--- | :--- | :--- |\n"
    )
    
    if active_jobs:
        markdown += "\n".join(active_jobs) + "\n"
    else:
        markdown += "| *None* | | | |\n"
        
    markdown += "\n### ✅ Completed / Inactive Jobs (Latest 10)\n"
    markdown += "| Job ID | Submitted At | File Count | Status |\n"
    markdown += "| :--- | :--- | :--- | :--- |\n"
    if completed_jobs:
        markdown += "\n".join(completed_jobs[:10]) + "\n"
    else:
        markdown += "| *None* | | | |\n"
        
    try:
        status_path.parent.mkdir(parents=True, exist_ok=True)
        temp_file = status_path.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f_out:
            f_out.write(markdown)
        temp_file.replace(status_path)
        print("📝 Updated wiki/concepts/K12_Batch_Status.md successfully.")
    except Exception as e:
        print(f"⚠️ Could not write K12_Batch_Status.md: {e}")

def load_cron_env(tso_dir):
    """Load API keys from .env if running in a non-interactive shell."""
    env_path = tso_dir / ".env"
    if not env_path.exists():
        print("❌ Error: .TSO/.env configuration file not found. Strict isolation enforced.")
        sys.exit(1)
        
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
    # Escape dollar signs for Obsidian LaTeX safety (if not already escaped)
    sanitized = re.sub(r'(?<!\\)\$', r'\$', sanitized)
    # Enforce UK English normalization rules
    sanitized = re.sub(r'\bsynthesize\b', 'synthesise', sanitized)
    # Normalise other potential American spellings
    sanitized = re.sub(r'\bsynthesized\b', 'synthesised', sanitized)
    sanitized = re.sub(r'\bsynthesizing\b', 'synthesising', sanitized)
    sanitized = re.sub(r'\bcategorize\b', 'categorise', sanitized)
    sanitized = re.sub(r'\bcategorized\b', 'categorised', sanitized)
    sanitized = re.sub(r'\bcategorizing\b', 'categorising', sanitized)
    return sanitized

async def run_strategic_synthesis(client, extraction_results, baseline_context, tso_dir):
    """Uses Pro model to synthesise data into wiki updates AND stakeholder reports with retries."""
    system_instruction = (
        "You are the Taylor's Schools Chief of Staff (Market Intelligence).\n"
        "Synthesise extraction into wiki updates and stakeholder briefs. UK English active.\n"
        "Output ONLY valid XML blocks:\n"
        "1. <updates><file path=\"wiki/Filename.md\">COMPLETE CONTENT</file></updates>\n"
        "2. <report path=\"Reports/YYYY-MM-DD_Market_Intelligence.md\">COMPLETE CONTENT</report>\n"
        "TARGET HIERARCHY for [ARCHIVE]:\n"
        "78. Financial & Audited Reports/<Category>/<School>/<Year>\n"
        "Categories: 1 Local Schools/Tier-1 Schools, 1 Local Schools/Tier-2 Schools, 2 Singapore Schools, etc.\n"
        "Example: [ARCHIVE: 00001.tif -> 78. Financial & Audited Reports/1 Local Schools/Tier-1 Schools/Alice Smith/2014]\n"
        "Include [ARCHIVE: filename -> folder] for EVERY document processed.\n"
        "[ignoring loop detection]\n"
        "Report MUST include: Executive Summary, Operations/Admissions Brief, and Marketing Brief."
    )
    prompt = f"BASELINE CONTEXT:\n{baseline_context}\n\nEXTRACTED DATA:\n{extraction_results}\n\nPerform final strategic synthesis and generate stakeholder reports."
    
    # Run with exponential backoff retries to prevent crashes due to rate limits
    response = None
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-pro",
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction
                )
            )
            break
        except Exception as e:
            if attempt == 3:
                raise e
            wait_time = (attempt + 1) * 5
            print(f"⚠️ Pro model call failed, retrying in {wait_time}s... Error: {e}")
            time.sleep(wait_time)
            
    if not response:
        print("❌ Error: Failed to get response from Gemini Pro.")
        return ""
        
    text = response.text
    sanitized = sanitize_content(text)
    
    # Process Wiki Updates
    file_blocks = re.findall(r'<file path="(.*?)">(.*?)</file>', sanitized, re.DOTALL)
    for rel_path, content in file_blocks:
        dest_path = tso_dir / rel_path.strip()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        # Handle potential file lock/GD delay when saving
        for attempt in range(3):
            try:
                with open(dest_path, "w", encoding="utf-8") as f_out:
                    f_out.write(content.strip())
                break
            except Exception as e:
                if attempt == 2:
                    raise e
                time.sleep(1)
        print(f"✅ Wiki Updated: {rel_path}")
        
    # Process Stakeholder Report
    report_match = re.search(r'<report path="(.*?)">(.*?)</report>', sanitized, re.DOTALL)
    if report_match:
        r_path, r_content = report_match.groups()
        actual_date = datetime.datetime.now().strftime("%Y-%m-%d")
        r_path = r_path.replace("YYYY-MM-DD", actual_date)
        dest_path = tso_dir / r_path.strip()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(3):
            try:
                with open(dest_path, "w", encoding="utf-8") as f_out:
                    f_out.write(r_content.strip())
                break
            except Exception as e:
                if attempt == 2:
                    raise e
                time.sleep(1)
        print(f"✅ Report Created: {r_path}")
        
    return text

def reconcile_orphaned_staging(tso_dir, registry_path, pending_base_dir, inbox_dir):
    """Restore any pending files that don't correspond to an active running job in the registry."""
    if not pending_base_dir.exists():
        return
    
    registry = {}
    if registry_path.exists():
        try:
            with open(registry_path, "r", encoding="utf-8") as f:
                registry = json.load(f)
        except Exception:
            pass
            
    active_jobs = {job_id.split("/")[-1] for job_id, details in registry.items() if details.get("status") == "RUNNING"}
    
    for item in pending_base_dir.iterdir():
        if item.is_dir() and item.name not in active_jobs:
            print(f"⚠️ Reconciling orphaned pending folder: {item.name}")
            for root, _, filenames in os.walk(item):
                for fname in filenames:
                    src_file = Path(root) / fname
                    dest_file = inbox_dir / fname
                    if dest_file.exists():
                        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                        dest_file = inbox_dir / f"{timestamp}_{fname}"
                    try:
                        shutil.move(str(src_file), str(dest_file))
                        print(f"   -> Rolled back orphaned file: {fname}")
                    except Exception as e:
                        print(f"   -> Error rolling back {fname}: {e}")
            try:
                shutil.rmtree(item)
            except Exception:
                pass

def main():
    tso_dir = Path(__file__).resolve().parent.parent
    load_cron_env(tso_dir)
    
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("ANTIGRAVITY_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY not found in environment.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)
    
    registry_path = (tso_dir / "raw" / "k12_batch_registry.json").resolve()
    archive_dir = (tso_dir / "raw" / "K12_Archive").resolve()
    inbox_dir = (tso_dir / "raw" / "K12_Inbox").resolve()
    pending_base_dir = (tso_dir / "raw" / "K12_Pending").resolve()
    
    inbox_dir.mkdir(parents=True, exist_ok=True)
    pending_base_dir.mkdir(parents=True, exist_ok=True)
    
    # 0. Reconcile orphaned files
    reconcile_orphaned_staging(tso_dir, registry_path, pending_base_dir, inbox_dir)
    
    if not registry_path.exists():
        print("✅ No active batch jobs in registry.")
        sys.exit(0)
        
    try:
        with open(registry_path, "r", encoding="utf-8") as f:
            registry = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load batch registry: {e}")
        sys.exit(1)
        
    active_jobs = [job_id for job_id, details in registry.items() if details.get("status") == "RUNNING"]
    if not active_jobs:
        print("✅ No active running batch jobs.")
        sys.exit(0)
        
    print(f"🔍 Found {len(active_jobs)} active batch jobs to check.")
    
    # Read Baseline Context
    baseline = ""
    for f_name in ["SITREP.md", "The Living Ledger.md", "GEMINI.md"]:
        f_path = tso_dir / f_name
        if f_path.exists():
            with open(f_path, "r", encoding="utf-8") as f:
                baseline += f"\n--- {f_name} ---\n{f.read()}\n"
                
    import asyncio
    
    for job_id in active_jobs:
        details = registry[job_id]
        print(f"Checking status for Job ID: {job_id}...")
        try:
            job_status = client.batches.get(name=job_id)
            state_str = str(job_status.state).upper()
            
            if "SUCCEEDED" in state_str or "COMPLETED" in state_str:
                # 1. Determine output file
                output_file_name = None
                if job_status.dest and job_status.dest.file_name:
                    output_file_name = job_status.dest.file_name
                if not output_file_name:
                    output_file_name = f"{job_id}_output.jsonl"
                
                results_path = tso_dir / "raw" / f"batch_results_{job_id.split('/')[-1]}.jsonl"
                print(f"📥 Downloading results to {results_path.name}...")
                
                file_data = client.files.download(file=output_file_name)
                with open(results_path, "wb") as f_out_bin:
                    f_out_bin.write(file_data)
                
                # 2. Parse Results and match custom_keys
                extractions = []
                processed_files = set()
                failed_keys = set()
                
                with open(results_path, "r", encoding="utf-8") as f_in:
                    for line in f_in:
                        if not line.strip():
                            continue
                        try:
                            res_obj = json.loads(line)
                            key = res_obj.get("key")
                            response = res_obj.get("response", {})
                            candidates = response.get("candidates", [])
                            if candidates:
                                text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                                extractions.append(text_content)
                                processed_files.add(key)
                            else:
                                print(f"⚠️ Job line execution failed for key: {key}")
                                failed_keys.add(key)
                        except Exception as e:
                            print(f"⚠️ Failed parsing output line: {e}")
                            
                # 3. Archive successfully processed files, roll back failures
                custom_id_to_files = details.get("custom_id_to_files", {})
                all_extractions_text = "\n".join(extractions)
                
                archive_matches = re.findall(r'\[ARCHIVE: (.*?) -> (.*?)\]', all_extractions_text)
                archive_map = {Path(k).name: v.strip().lstrip("/") for k, v in archive_matches}
                
                for key, paths in custom_id_to_files.items():
                    if key in processed_files:
                        for p in paths:
                            local_p = Path(p)
                            if local_p.exists():
                                target_sub = archive_map.get(local_p.name, "Uncategorised")
                                dest_folder = archive_dir / target_sub
                                dest_folder.mkdir(parents=True, exist_ok=True)
                                
                                dest = dest_folder / local_p.name
                                if dest.exists():
                                    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                                    dest = dest_folder / f"{timestamp}_{local_p.name}"
                                    
                                shutil.move(str(local_p), str(dest))
                                print(f"📦 Archived successfully: {local_p.name} -> {target_sub}")
                    else:
                        print(f"⚠️ Rolling back files for failed/unprocessed key: {key}")
                        for p in paths:
                            local_p = Path(p)
                            if local_p.exists():
                                dest = inbox_dir / local_p.name
                                if dest.exists():
                                    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                                    dest = inbox_dir / f"{timestamp}_{local_p.name}"
                                shards = str(local_p).split("/K12_Pending/")
                                if len(shards) > 1:
                                    shutil.move(str(local_p), str(dest))
                                
                # 4. Strategic Synthesis Stage
                if extractions:
                    print("🧠 Ingesting complete. Running strategic synthesis with Pro model...")
                    asyncio.run(run_strategic_synthesis(client, all_extractions_text, baseline, tso_dir))
                    
                # 5. Clean up pending directory, status, and remote Gemini Files API files
                pending_job_dir = tso_dir / "raw" / "K12_Pending" / job_id.split("/")[-1]
                if pending_job_dir.exists():
                    shutil.rmtree(pending_job_dir)
                    
                if results_path.exists():
                    results_path.unlink()
                    
                # Clean up uploaded Gemini files to keep quotas and security clean
                remote_files = details.get("remote_files_to_clean", [])
                for rf in remote_files:
                    try:
                        print(f"🧹 Deleting remote file from Gemini: {rf}")
                        client.files.delete(
                            name=rf,
                            config={'http_options': {'timeout': 10}}
                        )
                    except Exception as e:
                        print(f"   -> Error deleting remote file {rf}: {e}")
                        
                registry[job_id]["status"] = "COMPLETED"
                print(f"✅ Job {job_id} ingestion completed successfully.")
                
            elif "FAILED" in state_str or "CANCELLED" in state_str:
                print(f"❌ Job {job_id} failed or was cancelled. State: {job_status.state}. Rolling back all files...")
                custom_id_to_files = details.get("custom_id_to_files", {})
                for key, paths in custom_id_to_files.items():
                    for p in paths:
                        local_p = Path(p)
                        if local_p.exists():
                            dest = inbox_dir / local_p.name
                            if dest.exists():
                                timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                                dest = inbox_dir / f"{timestamp}_{local_p.name}"
                            shutil.move(str(local_p), str(dest))
                            
                pending_job_dir = tso_dir / "raw" / "K12_Pending" / job_id.split("/")[-1]
                if pending_job_dir.exists():
                    shutil.rmtree(pending_job_dir)
                    
                # Clean up remote files for failed jobs as well
                remote_files = details.get("remote_files_to_clean", [])
                for rf in remote_files:
                    try:
                        print(f"🧹 Deleting remote file from Gemini: {rf}")
                        client.files.delete(
                            name=rf,
                            config={'http_options': {'timeout': 10}}
                        )
                    except Exception as e:
                        print(f"   -> Error deleting remote file {rf}: {e}")
                        
                registry[job_id]["status"] = state_str
                
            else:
                print(f"⏳ Job {job_id} is still in progress (State: {job_status.state}).")
                
        except Exception as e:
            print(f"❌ Error checking status or processing Job {job_id}: {e}")
            
    # Save registry updates
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)
        
    update_markdown_status(tso_dir, registry, inbox_dir)

if __name__ == "__main__":
    main()
