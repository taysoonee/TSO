#!/usr/bin/env python3
import os
import sys
import json
import uuid
import shutil
import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from google import genai
from google.genai import types

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

def get_mime_type(suffix):
    s = suffix.lower()
    if s == '.pdf': return 'application/pdf'
    elif s in ['.png', '.jpg', '.jpeg', '.webp']: return f'image/{s.lstrip(".")}'
    elif s in ['.txt', '.md', '.csv']: return 'text/plain'
    return 'application/octet-stream'

MAX_SUBMISSION_FILES = 40

def get_sorting_key(f_path, inbox_dir):
    try:
        rel = f_path.relative_to(inbox_dir)
        if len(rel.parts) > 1:
            # File inside a folder -> group by top-level folder
            group_path = inbox_dir / rel.parts[0]
        else:
            # File at root -> group by file itself
            group_path = f_path
            
        group_mtime = group_path.stat().st_mtime
        return (group_mtime, group_path.name, str(f_path))
    except Exception:
        return (0.0, "", str(f_path))

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


def get_sorting_key(f_path, inbox_dir):
    try:
        rel = f_path.relative_to(inbox_dir)
        if len(rel.parts) > 1:
            # File inside a folder -> group by top-level folder
            group_path = inbox_dir / rel.parts[0]
        else:
            # File at root -> group by file itself
            group_path = f_path
            
        group_mtime = group_path.stat().st_mtime
        return (group_mtime, group_path.name, str(f_path))
    except Exception:
        return (0.0, "", str(f_path))



def main():
    tso_dir = Path(__file__).resolve().parent.parent
    load_cron_env(tso_dir)
    
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("ANTIGRAVITY_API_KEY")
    if not api_key:
        print("❌ Error: GEMINI_API_KEY not found in environment.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)
    
    inbox_dir = (tso_dir / "raw" / "K12_Inbox").resolve()
    pending_base_dir = (tso_dir / "raw" / "K12_Pending").resolve()
    registry_path = (tso_dir / "raw" / "k12_batch_registry.json").resolve()
    
    inbox_dir.mkdir(parents=True, exist_ok=True)
    pending_base_dir.mkdir(parents=True, exist_ok=True)
    
    # 0. Reconcile orphaned files
    reconcile_orphaned_staging(tso_dir, registry_path, pending_base_dir, inbox_dir)
    
    # 1. Read Baseline Context
    baseline = ""
    for f_name in ["SITREP.md", "The Living Ledger.md", "GEMINI.md"]:
        f_path = tso_dir / f_name
        if f_path.exists():
            with open(f_path, "r", encoding="utf-8") as f:
                baseline += f"\n--- {f_name} ---\n{f.read()}\n"
                
    # 2. Collect Inbox Files (excluding hidden/tmp, and files modified < 60s ago)
    files = []
    now_ts = datetime.datetime.now().timestamp()
    for root, _, filenames in os.walk(inbox_dir):
        for f_name in filenames:
            if f_name.startswith(".") or f_name.startswith("~$") or ".tmp" in f_name:
                continue
            f_path = Path(root) / f_name
            if f_path.is_file():
                try:
                    mtime = f_path.stat().st_mtime
                    if (now_ts - mtime) < 60:
                        print(f"   -> Skipping {f_name} (recently modified, syncing...)")
                        continue
                except Exception:
                    pass
                files.append(f_path)
                
    if not files:
        print("✅ K12 Inbox is empty. No batch submission needed.")
        sys.exit(0)
        
    print(f"🚦 Found {len(files)} files in K12 Inbox.")
    
    # Sort files by folder group mtime first, keeping folders intact in FIFO order
    files.sort(key=lambda x: get_sorting_key(x, inbox_dir))


    # Cap batch size to prevent dispatcher timeouts
    if len(files) > MAX_SUBMISSION_FILES:
        print(f"⚠️ Capping batch size to {MAX_SUBMISSION_FILES} files (out of {len(files)} total) to prevent timeouts.")
        files = files[:MAX_SUBMISSION_FILES]

    
    # 3. Categorise Files: Group small text/markdown, keep media/PDFs individual
    text_files = []
    media_files = []
    
    for f in files:
        suffix = f.suffix.lower()
        if suffix in ['.txt', '.md', '.csv'] and f.stat().st_size < 100 * 1024: # <100KB text
            text_files.append(f)
        else:
            media_files.append(f)
            
    batch_requests = []
    file_mapping = {}  # custom_id -> list of local files
    remote_files_registry = []
    
    system_instruction = (
        "You are the TSO Data Extraction Agent.\n"
        "Output structured summary: {school_name, jurisdiction, financial_period, revenue, profit, student_count, fees, strategic_notes, archive_folder}\n"
        "CRITICAL: For 'archive_folder', use '78. Financial & Audited Reports/<Category>/<School>/<Year>'.\n"
        "Categories: 1 Local Schools/Tier-1 Schools, 1 Local Schools/Tier-2 Schools, 2 Singapore Schools, etc.\n"
        "Include [ARCHIVE: filename -> folder] tag where filename is the exact local filename. DO NOT use tools. Text only."
    )
    
    # Parallel File Uploads to handle "Online Only" Google Drive downloads efficiently
    def upload_single_file(f):
        mime = get_mime_type(f.suffix)
        custom_id = f"media_{uuid.uuid4().hex[:12]}"
        print(f"   -> Uploading {f.name} ({mime})...")
        try:
            # Wrap read/upload in a retry loop to handle slow on-demand GD downloads
            for attempt in range(3):
                try:
                    uploaded_file = client.files.upload(file=f)
                    return custom_id, f, uploaded_file
                except Exception as e:
                    if attempt == 2:
                        raise e
                    print(f"      (Retry {attempt+1}) Error uploading {f.name}: {e}")
        except Exception as e:
            print(f"❌ Failed to upload or prepare {f.name}: {e}")
            return None

    if media_files:
        print(f"⚡ Parallel uploading {len(media_files)} media/PDF files...")
        with ThreadPoolExecutor(max_workers=4) as executor:
            upload_results = list(executor.map(upload_single_file, media_files))
            
        for result in upload_results:
            if result is None:
                continue
            custom_id, f, uploaded_file = result
            mime = get_mime_type(f.suffix)
            req = {
                "key": custom_id,
                "request": {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"text": f"BASELINE CONTEXT:\n{baseline}\n\nINPUT DOCUMENT:\nFILENAME: {f.name}"},
                                {"file_data": {"mime_type": mime, "file_uri": uploaded_file.uri}},
                                {"text": "Extract data from this document. Format as structured summary and include [ARCHIVE: <filename> -> <folder>] tag."}
                            ]
                        }
                    ],
                    "systemInstruction": {
                        "parts": [{"text": system_instruction}]
                    }
                }
            }
            batch_requests.append(req)
            file_mapping[custom_id] = [str(f.relative_to(inbox_dir))]
            remote_files_registry.append(uploaded_file.name)
            
    # Process Text Files in Chunks of 10
    chunk_size = 10
    for idx in range(0, len(text_files), chunk_size):
        chunk = text_files[idx:idx+chunk_size]
        custom_id = f"text_chunk_{uuid.uuid4().hex[:12]}"
        
        parts = [{"text": f"BASELINE CONTEXT:\n{baseline}\n\nINPUT DOCUMENTS:"}]
        mapped_paths = []
        for cf in chunk:
            try:
                # Retry read block to handle slow on-demand GD downloads for text files
                for attempt in range(3):
                    try:
                        with open(cf, "r", encoding="utf-8") as f_in:
                            parts.append({"text": f"\n--- FILENAME: {cf.name} ---\n{f_in.read()}"})
                        break
                    except Exception as e:
                        if attempt == 2:
                            raise e
                mapped_paths.append(str(cf.relative_to(inbox_dir)))
            except Exception as e:
                print(f"⚠️ Skipping text file {cf.name}: {e}")
                
        if len(parts) > 1:
            parts.append({"text": "Extract data from all the documents provided above. For EACH document, output a separate structured summary block and include the corresponding [ARCHIVE: filename -> folder] tag."})
            req = {
                "key": custom_id,
                "request": {
                    "contents": [{"role": "user", "parts": parts}],
                    "systemInstruction": {
                        "parts": [{"text": system_instruction}]
                    }
                }
            }
            batch_requests.append(req)
            file_mapping[custom_id] = mapped_paths
            
    if not batch_requests:
        print("❌ No requests successfully prepared for batch.")
        sys.exit(1)
        
    # 4. Generate JSONL file
    local_jsonl_path = tso_dir / "raw" / f"batch_requests_{uuid.uuid4().hex[:8]}.jsonl"
    with open(local_jsonl_path, "w", encoding="utf-8") as f_out:
        for req in batch_requests:
            f_out.write(json.dumps(req) + "\n")
            
    # 5. Upload JSONL and Create Batch Job
    print("📤 Uploading batch_requests.jsonl to Gemini...")
    uploaded_jsonl = client.files.upload(
        file=local_jsonl_path,
        config=types.UploadFileConfig(mime_type="text/plain")
    )
    remote_files_registry.append(uploaded_jsonl.name)
    
    print("🚀 Creating Gemini Batch Job...")
    job = client.batches.create(
        model="gemini-2.5-flash",
        src=uploaded_jsonl.name,
        config=types.CreateBatchJobConfig(display_name=f"K12_Batch_Ingest_{datetime.date.today()}")
    )
    
    job_id = job.name
    print(f"✅ Batch Job Created successfully: {job_id}")
    
    # 6. Move files to staging Pending folder
    job_pending_dir = pending_base_dir / job_id.split("/")[-1]
    job_pending_dir.mkdir(parents=True, exist_ok=True)
    
    staged_files_mapping = {}
    for custom_id, rel_paths in file_mapping.items():
        staged_files_mapping[custom_id] = []
        for rel_p in rel_paths:
            src = inbox_dir / rel_p
            dest = job_pending_dir / rel_p
            dest.parent.mkdir(parents=True, exist_ok=True)
            if src.exists():
                shutil.move(str(src), str(dest))
                staged_files_mapping[custom_id].append(str(dest))
                
    # 7. Update Registry
    registry = {}
    if registry_path.exists():
        try:
            with open(registry_path, "r", encoding="utf-8") as f:
                registry = json.load(f)
        except Exception:
            pass
            
    registry[job_id] = {
        "submitted_at": datetime.datetime.now().isoformat(),
        "status": "RUNNING",
        "custom_id_to_files": staged_files_mapping,
        "remote_files_to_clean": remote_files_registry
    }
    
    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)
        
    update_markdown_status(tso_dir, registry, inbox_dir)
        
    # Cleanup local temporary JSONL file
    if local_jsonl_path.exists():
        local_jsonl_path.unlink()
        
    print(f"🏁 Submission phase complete. Files moved to {job_pending_dir.name}.")

if __name__ == "__main__":
    main()
