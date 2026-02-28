// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'

console.log("[telegram-webhook] Edge Function initialized")

Deno.serve(async (req) => {
  try {
    // POST 요청만 허용
    if (req.method !== 'POST') {
      console.log("[telegram-webhook] Non-POST request rejected")
      return new Response('Method Not Allowed', { status: 405 })
    }

    // 환경 변수 확인
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[telegram-webhook] Missing Supabase credentials")
      return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      })
    }

    // Webhook secret 검증
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    if (webhookSecret && secret !== webhookSecret) {
      console.error("[telegram-webhook] Invalid webhook secret")
      return new Response('Unauthorized', { status: 401 })
    }

    // Telegram Update JSON 파싱
    const update = await req.json()
    console.log("[telegram-webhook] Received update id:", update.update_id)

    // 메시지 추출
    const message = update.message || update.edited_message || update.channel_post
    if (!message) {
      console.log("[telegram-webhook] No message in update, ignoring")
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    // Supabase 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // telegram_groups에서 chat_id로 그룹 조회 (telegram_chat_id는 bigint)
    const chatId = message.chat.id
    console.log("[telegram-webhook] Looking up group for chat_id:", chatId)

    const { data: group, error: groupError } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .single()

    if (groupError || !group) {
      console.log("[telegram-webhook] No active group found for chat_id:", chatId, "- ignoring")
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    console.log("[telegram-webhook] Found group:", group.id, group.chat_title)

    // 메시지 타입 및 메타데이터 분석
    const text: string = message.text || message.caption || ''

    // 파일 정보 추출
    let fileId: string | null = null
    let fileName: string | null = null
    let fileSize: number | null = null
    let fileMimeType: string | null = null
    let messageType = 'text'
    let hasFile = false

    if (message.photo && message.photo.length > 0) {
      // photo는 배열 - 마지막 요소가 가장 큰 이미지
      const photo = message.photo[message.photo.length - 1]
      fileId = photo.file_id
      messageType = 'photo'
      hasFile = true
      fileName = `photo_${message.message_id}.jpg`
    } else if (message.document) {
      fileId = message.document.file_id
      fileName = message.document.file_name || `document_${message.message_id}`
      fileSize = message.document.file_size || null
      fileMimeType = message.document.mime_type || null
      messageType = 'document'
      hasFile = true
    } else if (message.video) {
      fileId = message.video.file_id
      fileName = message.video.file_name || `video_${message.message_id}.mp4`
      fileSize = message.video.file_size || null
      fileMimeType = message.video.mime_type || null
      messageType = 'video'
      hasFile = true
    }

    // URL 추출 (텍스트에서 regex + entities)
    const urlRegex = /(https?:\/\/[^\s<>"]+)/gi
    const urlsFromText: string[] = text.match(urlRegex) || []

    const urlsFromEntities: string[] = []
    if (message.entities && Array.isArray(message.entities)) {
      for (const entity of message.entities) {
        if (entity.type === 'url') {
          const urlText = text.substring(entity.offset, entity.offset + entity.length)
          urlsFromEntities.push(urlText)
        } else if (entity.type === 'text_link' && entity.url) {
          urlsFromEntities.push(entity.url)
        }
      }
    }
    if (message.caption_entities && Array.isArray(message.caption_entities)) {
      for (const entity of message.caption_entities) {
        if (entity.type === 'url') {
          const urlText = text.substring(entity.offset, entity.offset + entity.length)
          urlsFromEntities.push(urlText)
        } else if (entity.type === 'text_link' && entity.url) {
          urlsFromEntities.push(entity.url)
        }
      }
    }

    const allUrls = Array.from(new Set([...urlsFromText, ...urlsFromEntities]))
    const hasLink = allUrls.length > 0

    // 발신자 이름 포맷
    const firstName = message.from?.first_name || ''
    const lastName = message.from?.last_name ? ` ${message.from.last_name}` : ''
    const senderName = `${firstName}${lastName}`.trim() || 'Unknown'
    const senderUsername = message.from?.username || null

    console.log("[telegram-webhook] Message type:", messageType, "hasFile:", hasFile, "hasLink:", hasLink, "sender:", senderName)

    // 파일 URL 해석 (file_id -> file_path -> URL)
    let fileUrl: string | null = null
    if (hasFile && fileId && botToken) {
      try {
        const getFileRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        )
        const getFileData = await getFileRes.json()
        if (getFileData.ok && getFileData.result?.file_path) {
          fileUrl = `https://api.telegram.org/file/bot${botToken}/${getFileData.result.file_path}`
          console.log("[telegram-webhook] Resolved file URL for file_id:", fileId)
        } else {
          console.error("[telegram-webhook] getFile failed:", getFileData)
        }
      } catch (fileErr) {
        console.error("[telegram-webhook] Error resolving file URL:", fileErr)
      }
    }

    // extracted_links: { url: string; title?: string }[] 형식
    const extractedLinks = allUrls.length > 0
      ? allUrls.map(u => ({ url: u }))
      : null

    // telegram_messages에 저장 (DB 스키마에 맞는 컬럼명 사용)
    const messageInsert: Record<string, unknown> = {
      telegram_group_id: group.id,
      telegram_message_id: message.message_id,
      telegram_chat_id: chatId,
      sender_name: senderName,
      sender_username: senderUsername,
      message_type: messageType,
      message_text: text || null,
      file_id: fileId,
      file_name: fileName,
      file_size: fileSize,
      file_mime_type: fileMimeType,
      file_url: fileUrl,
      has_file: hasFile,
      has_link: hasLink,
      extracted_links: extractedLinks,
      raw_update: update,
      telegram_date: new Date(message.date * 1000).toISOString(),
      is_posted: false,
    }

    const { data: savedMessage, error: insertError } = await supabase
      .from('telegram_messages')
      .insert(messageInsert)
      .select()
      .single()

    if (insertError) {
      console.error("[telegram-webhook] Error inserting message:", insertError)
      // 항상 200 반환하여 Telegram 재시도 방지
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    console.log("[telegram-webhook] Message saved:", savedMessage.id)

    // 파일 또는 링크가 있으면 telegram_board_posts에 즉시 게시
    if (hasFile || hasLink) {
      let postTitle = ''
      let postType = ''
      let contentHtml = ''
      let postFileUrls: { url: string; name?: string; type?: string; size?: number }[] | null = null
      let postLinkUrls: { url: string; title?: string }[] | null = null

      if (hasFile) {
        postTitle = `[파일] ${fileName || messageType} - ${senderName}`
        postType = 'file'
        postFileUrls = fileUrl ? [{ url: fileUrl, name: fileName || undefined, type: fileMimeType || undefined, size: fileSize || undefined }] : []

        contentHtml = `<p>${text ? text.replace(/\n/g, '<br>') : ''}</p>`
        if (fileUrl) {
          contentHtml += `<p><strong>파일:</strong> <a href="${fileUrl}" target="_blank">${fileName || messageType}</a></p>`
        }
        if (fileSize) {
          contentHtml += `<p><strong>크기:</strong> ${Math.round(fileSize / 1024)}KB</p>`
        }
        if (allUrls.length > 0) {
          contentHtml += `<p><strong>링크:</strong></p><ul>${allUrls.map(u => `<li><a href="${u}" target="_blank">${u}</a></li>`).join('')}</ul>`
          postLinkUrls = allUrls.map(u => ({ url: u }))
        }
      } else if (hasLink) {
        const firstUrl = allUrls[0]
        postTitle = `[링크] ${firstUrl.substring(0, 80)} - ${senderName}`
        postType = 'link'
        postLinkUrls = allUrls.map(u => ({ url: u }))

        contentHtml = `<p>${text ? text.replace(/\n/g, '<br>') : ''}</p>`
        contentHtml += `<p><strong>링크:</strong></p><ul>${allUrls.map(u => `<li><a href="${u}" target="_blank">${u}</a></li>`).join('')}</ul>`
      }

      const postInsert: Record<string, unknown> = {
        telegram_group_id: group.id,
        title: postTitle,
        content: contentHtml,
        post_type: postType,
        source_message_ids: [savedMessage.id],
        file_urls: postFileUrls,
        link_urls: postLinkUrls,
      }

      const { error: postError } = await supabase
        .from('telegram_board_posts')
        .insert(postInsert)

      if (postError) {
        console.error("[telegram-webhook] Error inserting board post:", postError)
      } else {
        console.log("[telegram-webhook] Board post created for message:", savedMessage.id)

        // 메시지를 is_posted = true로 업데이트
        const { error: updateError } = await supabase
          .from('telegram_messages')
          .update({ is_posted: true })
          .eq('id', savedMessage.id)

        if (updateError) {
          console.error("[telegram-webhook] Error marking message as posted:", updateError)
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (error: unknown) {
    console.error("[telegram-webhook] Unexpected error:", error)
    // 항상 200 반환하여 Telegram 재시도 방지
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    })
  }
})
