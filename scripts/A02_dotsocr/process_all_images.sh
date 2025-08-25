#!/bin/bash
# This script processes all images in the '~/input' directory in parallel,
# replicating the input directory structure in the '~/result' directory.
#
# Usage: ./process_all_images.sh [-p parallel_jobs] [-m max_pixels]
# Example: ./process_all_images.sh -p 8 -m 3000000

# --- Configuration ---
VM_INPUT_DIR="$HOME/input"
VM_RESULT_DIR="$HOME/result"
CONTAINER_INPUT_DIR="/app/test_images"
CONTAINER_OUTPUT_DIR="/app/output"
CONTAINER_NAME="dots_ocr_service_instance"

# --- Default Arguments ---
PARALLEL_JOBS=4
MAX_PIXELS_VALUE=""

# --- Argument Parsing with getopts ---
while getopts ":p:m:" opt;
do
  case ${opt} in
    p )
      PARALLEL_JOBS=$OPTARG
      ;;
    m )
      MAX_PIXELS_VALUE=$OPTARG
      ;;
    \? )
      echo "Invalid option: -$OPTARG" 1>&2
      exit 1
      ;;
    :	)
      echo "Option -$OPTARG requires an argument." 1>&2
      exit 1
      ;;
  esac
done

# --- Argument Handling ---
MAX_PIXELS_ARG=""
if [ -n "$MAX_PIXELS_VALUE" ]; then
    MAX_PIXELS_ARG="--max_pixels $MAX_PIXELS_VALUE"
    echo "Using --max_pixels with value: $MAX_PIXELS_VALUE"
else
    echo "Running with original image resolution (no --max_pixels)."
fi
echo "Using $PARALLEL_JOBS parallel jobs."

# --- Main Logic ---
echo "Starting parallel processing..."
echo "Input directory: $VM_INPUT_DIR"
echo "Output directory: $VM_RESULT_DIR"

# Find all image files and process them
find "$VM_INPUT_DIR" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) | while read -r full_vm_path;
do
    # Get the relative path from the input directory
    relative_path=$(realpath --relative-to="$VM_INPUT_DIR" "$full_vm_path")
    
    # Get the directory part of the relative path
    relative_dir=$(dirname "$relative_path")

    # Define the specific output directory for this file
    target_vm_output_dir="$VM_RESULT_DIR/$relative_dir"
    target_container_output_dir="$CONTAINER_OUTPUT_DIR/$relative_dir"

    # Create the corresponding output subdirectory on the VM
    mkdir -p "$target_vm_output_dir"

    # Define the full path for the container to read the input file
    container_input_path="$CONTAINER_INPUT_DIR/$relative_path"

    # --- Dynamic Fitz Preprocessing Logic ---
    dimensions=$(identify -format "%w %h" "$full_vm_path")
    read width height <<< "$dimensions"
    pixels=$((width * height))
    threshold=1200000
    
    NO_FITZ_ARG="" # Default: Use fitz preprocess
    if [ "$pixels" -gt "$threshold" ]; then
        NO_FITZ_ARG="--no_fitz_preprocess"
    fi
    # --- End of Dynamic Logic ---

    # Run the parser in the background
    (
        echo "Processing: $relative_path (Fitz: $([ -z "$NO_FITZ_ARG" ] && echo "On" || echo "Off"))"
        sudo docker exec "$CONTAINER_NAME" python3 /app/dots_ocr/parser.py \
          "$container_input_path" \
          --output "$target_container_output_dir" \
          --prompt prompt_layout_only_en $MAX_PIXELS_ARG --temperature 0 $NO_FITZ_ARG
    ) &

    # Limit the number of parallel jobs
    if [[ $(jobs -r -p | wc -l) -ge $PARALLEL_JOBS ]]; then
      wait -n
    fi
done

# Wait for all remaining background jobs to finish
wait

echo "All processing finished successfully."
echo "Results are in $VM_RESULT_DIR"
