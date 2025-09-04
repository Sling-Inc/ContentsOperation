import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// data 폴더 경로
const dataDir = path.join(__dirname, '../data');

// zip 파일을 찾고 압축해제하는 함수
async function extractZipFiles(dir) {
    try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                // 디렉토리인 경우 재귀적으로 탐색
                await extractZipFiles(fullPath);
            } else if (stat.isFile() && item.toLowerCase().endsWith('.zip')) {
                // zip 파일인 경우 압축해제
                console.log(`압축해제 중: ${fullPath}`);
                
                try {
                    // zip 파일명에서 확장자를 제거하여 폴더명 생성
                    const zipNameWithoutExt = path.parse(item).name;
                    const extractDir = path.join(dir, zipNameWithoutExt);
                    
                    // 압축해제할 폴더가 이미 존재하는지 확인
                    if (fs.existsSync(extractDir)) {
                        console.log(`⚠️  폴더가 이미 존재합니다: ${zipNameWithoutExt}`);
                        // 기존 폴더를 삭제하고 새로 생성
                        fs.rmSync(extractDir, { recursive: true, force: true });
                        console.log(`🗑️  기존 폴더 삭제: ${zipNameWithoutExt}`);
                    }
                    
                    // 압축해제할 폴더 생성
                    fs.mkdirSync(extractDir, { recursive: true });
                    console.log(`📁 폴더 생성: ${zipNameWithoutExt}`);
                    
                    // macOS의 ditto 명령어를 사용하여 한글 인코딩 문제 해결
                    console.log(`압축해제 시작: ${item} -> ${zipNameWithoutExt}/`);
                    
                    await new Promise((resolve, reject) => {
                        const dittoProcess = spawn('ditto', ['-V', '-x', '-k', '--sequesterRsrc', '--rsrc', fullPath, extractDir], {
                            stdio: 'inherit',
                            shell: false
                        });
                        
                        dittoProcess.on('close', (code) => {
                            if (code === 0) {
                                console.log(`✅ 압축해제 완료: ${item} -> ${zipNameWithoutExt}/`);
                                resolve();
                            } else {
                                console.error(`❌ 압축해제 실패: ${item} (종료 코드: ${code})`);
                                reject(new Error(`ditto failed with code ${code}`));
                            }
                        });
                        
                        dittoProcess.on('error', (error) => {
                            console.error(`❌ 압축해제 오류: ${item}`, error.message);
                            reject(error);
                        });
                    });
                } catch (error) {
                    console.error(`❌ 압축해제 실패: ${item}`, error.message);
                }
            }
        }
    } catch (error) {
        console.error(`디렉토리 읽기 실패: ${dir}`, error.message);
    }
}

// 메인 실행
async function main() {
    console.log('data 폴더에서 zip 파일들을 찾아 압축해제를 시작합니다...');
    console.log(`탐색 경로: ${dataDir}`);

    if (!fs.existsSync(dataDir)) {
        console.error('data 폴더가 존재하지 않습니다.');
        process.exit(1);
    }

    try {
        await extractZipFiles(dataDir);
        console.log('모든 zip 파일 압축해제가 완료되었습니다.');
    } catch (error) {
        console.error('압축해제 중 오류가 발생했습니다:', error.message);
        process.exit(1);
    }
}

main(); 