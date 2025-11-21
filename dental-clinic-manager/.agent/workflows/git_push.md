---
description: Git 변경 사항을 자동으로 스테이징, 커밋 및 푸시합니다.
---

1. `git status`를 실행하여 변경 사항을 확인합니다.
2. `git add .` 명령어로 모든 변경 사항을 스테이징합니다.
   - 만약 `nul` 파일 관련 에러가 발생하면, `cmd /c del "\\?\c:\Project\dental_clinic_manager\dental-clinic-manager\nul"` 명령어로 해당 파일을 삭제하고 다시 시도합니다.
3. 변경 사항에 대한 요약을 바탕으로 적절한 커밋 메시지를 생성하여 `git commit -m "메시지"`를 실행합니다.
4. `git push` 명령어로 원격 저장소에 푸시합니다.
