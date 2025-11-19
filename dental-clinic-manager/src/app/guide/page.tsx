// c:\Project\dental_clinic_manager\dental-clinic-manager\src\app\guide\page.tsx
import { Shield, Phone, FileText, Archive, Calendar, ClipboardList, BookUser } from 'lucide-react';

const features = [
  {
    title: '사용자 관리',
    description: '역할(원장, 직원 등)에 따라 접근 권한을 제어하고 안전한 인증을 통해 시스템을 보호합니다.',
    icon: <Shield className="w-12 h-12 text-blue-500" />,
  },
  {
    title: '해피콜 관리',
    description: '진료 후 환자 피드백을 체계적으로 기록하고 관리하여 고객 만족도를 향상시킵니다.',
    icon: <Phone className="w-12 h-12 text-green-500" />,
  },
  {
    title: '일일 보고서',
    description: '일일 업무 현황을 요약한 보고서를 자동으로 생성하여 데이터 기반의 의사결정을 돕습니다.',
    icon: <FileText className="w-12 h-12 text-indigo-500" />,
  },
  {
    title: '재고 관리',
    description: '실시간으로 재고 현황을 추적하고 부족한 물품을 제때 파악하여 효율적인 재고 관리를 지원합니다.',
    icon: <Archive className="w-12 h-12 text-yellow-500" />,
  },
  {
    title: '업무 스케줄 관리',
    description: '개인 및 팀의 스케줄을 한눈에 확인하여 효율적인 인력 배치를 가능하게 합니다.',
    icon: <Calendar className="w-12 h-12 text-purple-500" />,
  },
  {
    title: '프로토콜 관리',
    description: '표준화된 진료 프로토콜을 설정하여 모든 직원에게 일관된 고품질의 진료 서비스를 제공합니다.',
    icon: <ClipboardList className="w-12 h-12 text-red-500" />,
  },
];

export default function GuidePage() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            치과 관리 시스템 사용 안내
          </h1>
          <p className="text-lg text-gray-600">
            업무 효율성을 높이는 다양한 기능을 만나보세요.
          </p>
        </header>

        <main>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white p-8 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 flex flex-col items-center text-center"
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="text-center mt-16">
           <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded-md">
             <div className="flex items-center">
                <BookUser className="w-6 h-6 mr-3" />
                <div>
                    <p className="font-bold">페이지별 상세 사용법</p>
                    <p>로그인 후 대시보드에서 각 기능 페이지로 이동하여 스케줄, 재고 등을 관리할 수 있습니다.</p>
                </div>
             </div>
           </div>
        </footer>
      </div>
    </div>
  );
}
