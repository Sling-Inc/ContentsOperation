#!/bin/bash
# 이 스크립트는 dots-ocr-l4-test-vm VM을 시작하고,
# OCR API 서버 컨테이너를 백그라운드에서 자동으로 실행하며,
# 입력/결과 폴더를 마운트하고, 모델 로딩을 위해 1분간 대기합니다.

set -e

INSTANCE_NAME="dots-ocr-l4-test-vm"
ZONE="asia-northeast3-a"
CONTAINER_NAME="dots_ocr_service_instance"
IMAGE_NAME="custom-dots-ocr:unified"

echo ">>> 1/3: VM '$INSTANCE_NAME'을 시작합니다..."
gcloud compute instances start $INSTANCE_NAME --zone=$ZONE

echo ">>> VM이 시작되었습니다. SSH 연결을 위해 30초간 대기합니다..."
sleep 30

echo ">>> 2/3: VM에 접속하여 폴더를 마운트하고 API 서버 컨테이너를 시작합니다..."
gcloud compute ssh $INSTANCE_NAME --zone $ZONE --command="
    set -e
    echo '--- 기존 컨테이너 정리 ---'
    sudo docker rm -f $CONTAINER_NAME &> /dev/null || true
    
    echo '--- VM 내 입/출력 폴더 생성 (input, result) ---'
    mkdir -p ~/input ~/result

    echo '--- API 서버 컨테이너를 백그라운드에서 시작합니다 ---'
    sudo docker run -d --rm --gpus all --name $CONTAINER_NAME -v ~/input:/app/test_images -v ~/result:/app/output $IMAGE_NAME
"

echo ">>> 3/3: 컨테이너가 시작되었습니다. 모델 로딩을 위해 1분간 대기합니다..."
sleep 60

echo "--------------------------------------------------"
echo "API 서버가 준비되었습니다."
echo "VM의 '~/input' 폴더에 이미지를 넣고 OCR 작업을 실행하세요."
echo "결과는 VM의 '~/result' 폴더에 생성됩니다."
echo "--------------------------------------------------"
