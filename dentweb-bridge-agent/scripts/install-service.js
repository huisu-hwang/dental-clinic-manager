// Windows 서비스로 등록하는 스크립트
// 관리자 권한으로 실행 필요: node scripts/install-service.js

const path = require('path')

try {
  const Service = require('node-windows').Service

  const svc = new Service({
    name: 'DentWeb Bridge Agent',
    description: '덴트웹 DB → Supabase 동기화 브릿지 에이전트',
    script: path.resolve(__dirname, '../dist/index.js'),
    nodeOptions: [],
    env: [{
      name: 'NODE_ENV',
      value: 'production'
    }]
  })

  svc.on('install', () => {
    console.log('서비스 설치 완료! 서비스를 시작합니다...')
    svc.start()
  })

  svc.on('start', () => {
    console.log('서비스가 시작되었습니다.')
    console.log('Windows 서비스 관리에서 "DentWeb Bridge Agent"를 확인하세요.')
  })

  svc.on('error', (err) => {
    console.error('서비스 오류:', err)
  })

  const args = process.argv.slice(2)

  if (args.includes('--uninstall')) {
    svc.on('uninstall', () => {
      console.log('서비스가 제거되었습니다.')
    })
    svc.uninstall()
  } else {
    svc.install()
  }
} catch (error) {
  console.error('node-windows 패키지가 필요합니다. npm install 후 다시 시도해주세요.')
  console.error(error)
}
