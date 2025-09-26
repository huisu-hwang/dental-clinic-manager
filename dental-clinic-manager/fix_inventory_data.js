// 선물 재고 데이터 수정 스크립트
// 브라우저 개발자 도구에서 실행하여 잘못된 재고 데이터를 수정합니다.

console.log("=== 선물 재고 데이터 수정 스크립트 ===");

async function fixInventoryData() {
  try {
    // Supabase 클라이언트 가져오기
    const { getSupabase } = window;
    if (!getSupabase) {
      console.error("Supabase 클라이언트를 찾을 수 없습니다.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      console.error("Supabase 클라이언트가 초기화되지 않았습니다.");
      return;
    }

    console.log("1. 현재 재고 현황 조회...");
    const { data: currentInventory, error: invError } = await supabase
      .from('gift_inventory')
      .select('*')
      .order('name');

    if (invError) {
      console.error("재고 조회 실패:", invError);
      return;
    }

    console.log("현재 재고:", currentInventory);

    console.log("2. 모든 선물 로그 조회...");
    const { data: allGiftLogs, error: logError } = await supabase
      .from('gift_logs')
      .select('*')
      .order('date', { ascending: true });

    if (logError) {
      console.error("선물 로그 조회 실패:", logError);
      return;
    }

    console.log(`총 ${allGiftLogs.length}개의 선물 로그 발견`);

    console.log("3. 선물별 총 사용량 계산...");
    const giftUsage = {};

    allGiftLogs.forEach(log => {
      if (log.gift_type !== '없음') {
        if (!giftUsage[log.gift_type]) {
          giftUsage[log.gift_type] = 0;
        }
        giftUsage[log.gift_type] += 1; // 기존 데이터는 수량이 1개로 가정
      }
    });

    console.log("선물별 총 사용량:", giftUsage);

    console.log("4. 재고 입고 로그 조회...");
    const { data: inventoryLogs, error: logErr } = await supabase
      .from('inventory_logs')
      .select('*')
      .gt('change', 0) // 입고 기록만 (양수)
      .order('timestamp', { ascending: true });

    if (logErr) {
      console.error("재고 로그 조회 실패:", logErr);
      return;
    }

    console.log("5. 선물별 총 입고량 계산...");
    const giftRestocked = {};

    inventoryLogs.forEach(log => {
      if (!giftRestocked[log.name]) {
        giftRestocked[log.name] = 0;
      }
      giftRestocked[log.name] += log.change;
    });

    console.log("선물별 총 입고량:", giftRestocked);

    console.log("6. 올바른 재고 계산 및 수정...");
    for (const item of currentInventory) {
      const totalRestocked = giftRestocked[item.name] || 0;
      const totalUsed = giftUsage[item.name] || 0;
      const correctStock = totalRestocked - totalUsed;

      console.log(`\n${item.name}:`);
      console.log(`  현재 재고: ${item.stock}`);
      console.log(`  총 입고량: ${totalRestocked}`);
      console.log(`  총 사용량: ${totalUsed}`);
      console.log(`  올바른 재고: ${correctStock}`);

      if (item.stock !== correctStock) {
        console.log(`  ⚠️ 재고 불일치 발견! ${item.stock} → ${correctStock}로 수정 필요`);

        // 재고 수정
        const { error: updateError } = await supabase
          .from('gift_inventory')
          .update({ stock: correctStock })
          .eq('id', item.id);

        if (updateError) {
          console.error(`  ❌ ${item.name} 재고 수정 실패:`, updateError);
        } else {
          console.log(`  ✅ ${item.name} 재고 수정 완료: ${item.stock} → ${correctStock}`);

          // 수정 로그 추가
          await supabase
            .from('inventory_logs')
            .insert([{
              timestamp: new Date().toISOString(),
              name: item.name,
              reason: '재고 데이터 오류 수정',
              change: correctStock - item.stock,
              old_stock: item.stock,
              new_stock: correctStock
            }]);
        }
      } else {
        console.log(`  ✅ ${item.name} 재고 정상`);
      }
    }

    console.log("\n=== 재고 데이터 수정 완료 ===");

  } catch (error) {
    console.error("스크립트 실행 중 오류 발생:", error);
  }
}

// 스크립트 실행
fixInventoryData();