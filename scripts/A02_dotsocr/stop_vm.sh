#!/bin/bash
# 이 스크립트는 dots-ocr-l4-test-vm VM을 중지합니다.

INSTANCE_NAME=${1:-"dots-ocr-l4-test-vm"}
ZONE="asia-northeast3-a"

echo "VM '$INSTANCE_NAME'을 중지합니다..."
gcloud compute instances stop $INSTANCE_NAME --zone=$ZONE

if [ $? -eq 0 ]; then
    echo "VM이 성공적으로 중지되었습니다."
else
    echo "VM 중지에 실패했습니다."
fi
