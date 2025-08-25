#!/bin/bash
# This script downloads results from the VM efficiently and restructures them locally.
# It uses a single recursive scp for speed and accepts an output directory.
#
# Usage: ./download_results.sh [-i] [-o <output_dir>]
#   -i: Include images (.jpg) in the download.
#   -o: Specify the output directory (default: ./results)

# --- Configuration ---
VM_NAME="dots-ocr-l4-test-vm"
ZONE="asia-northeast3-a"
REMOTE_BASE_DIR="~/result"
LOCAL_FINAL_DIR="./results" # Default output directory
LOCAL_TEMP_DIR="./results_temp_$(date +%s)" # Unique temp directory

# --- Default Arguments ---
INCLUDE_IMAGES=false

# --- Argument Parsing ---
while getopts "io:" opt; do
  case ${opt} in
    i)
      INCLUDE_IMAGES=true
      ;;
    o)
      LOCAL_FINAL_DIR=$OPTARG
      ;;
    \?)
      echo "Invalid Option: -$OPTARG" 1>&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." 1>&2
      exit 1
      ;;
  esac
done

# --- Main Logic ---
echo "Preparing to download results to '$LOCAL_FINAL_DIR'..."
# Clean local final directory first
echo "Cleaning local directory: $LOCAL_FINAL_DIR"
rm -rf "$LOCAL_FINAL_DIR"
mkdir -p "$LOCAL_FINAL_DIR"

# --- Step 1: Download ALL results to a temporary directory ---
echo "Downloading all results from VM to a temporary directory ($LOCAL_TEMP_DIR)..."
gcloud compute scp --recurse "$VM_NAME:$REMOTE_BASE_DIR" "$LOCAL_TEMP_DIR" --zone="$ZONE" --quiet

# Check if any files were downloaded
if [ ! -d "$LOCAL_TEMP_DIR" ] || [ -z "$(ls -A "$LOCAL_TEMP_DIR")" ]; then
    echo "No files were downloaded from the VM."
    rm -rf "$LOCAL_TEMP_DIR"
    exit 0
fi
echo "Download phase complete."

# --- Step 2: Filter and restructure files locally ---
echo "Restructuring downloaded files..."
# Note: The scp command copies the *contents* of result, so the temp dir itself is the base.
TEMP_RESULT_DIR="$LOCAL_TEMP_DIR"

FIND_CMD_LOCAL="find \"$TEMP_RESULT_DIR\" -type f -name '*.json'"
if [ "$INCLUDE_IMAGES" = true ]; then
    FIND_CMD_LOCAL="$FIND_CMD_LOCAL -o -name '*.jpg'"
    echo "Will process .jpg and .json files."
else
    echo "Will process .json files only."
fi

eval "$FIND_CMD_LOCAL" | while IFS= read -r temp_path; do
    # Get the filename (e.g., "page.1.json")
    filename=$(basename "$temp_path")
    # Get the filename without extension (e.g., "page.1")
    filename_base="${filename%.*}"
    
    # Get the immediate parent directory name (e.g., "page.1")
    parent_dir_name=$(basename "$(dirname "$temp_path")")

    # Get the path relative to the temp 'result' subdir using sed
    relative_path=$(echo "$temp_path" | sed "s|^$TEMP_RESULT_DIR/||")

    local_dest_path=""

    # Check if the parent directory name matches the filename base
    if [ "$parent_dir_name" = "$filename_base" ]; then
        grandparent_dir=$(dirname "$(dirname "$relative_path")")
        if [ "$grandparent_dir" = "." ]; then
            local_dest_path="$LOCAL_FINAL_DIR/$filename"
        else
            local_dest_path="$LOCAL_FINAL_DIR/$grandparent_dir/$filename"
        fi
    else
        local_dest_path="$LOCAL_FINAL_DIR/$relative_path"
    fi

    # Create the local directory structure and move the file
    mkdir -p "$(dirname "$local_dest_path")"
    mv "$temp_path" "$local_dest_path"
done

# --- Step 3: Cleanup ---
echo "Cleaning up temporary directory..."
rm -rf "$LOCAL_TEMP_DIR"

echo "Download and restructuring finished."
echo "Final results are in '$LOCAL_FINAL_DIR'"
