// ============================================
// Threads API 발행기
// ============================================

interface ThreadsConfig {
  accessToken: string;
  userId: string;
}

interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export class ThreadsPublisher {
  private config: ThreadsConfig;

  constructor(config: ThreadsConfig) {
    this.config = config;
  }

  /**
   * 텍스트 포스트 발행
   */
  async publishText(text: string, link?: string): Promise<PublishResult> {
    try {
      const content = link ? `${text}\n\n${link}` : text;

      // 1. 미디어 컨테이너 생성
      const createRes = await fetch(
        `https://graph.threads.net/v1.0/${this.config.userId}/threads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'TEXT',
            text: content,
            access_token: this.config.accessToken,
          }),
        }
      );
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message);

      // 2. 발행
      const publishRes = await fetch(
        `https://graph.threads.net/v1.0/${this.config.userId}/threads_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: this.config.accessToken,
          }),
        }
      );
      const publishData = await publishRes.json();
      if (publishData.error) throw new Error(publishData.error.message);

      return {
        success: true,
        postId: publishData.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 이미지 + 텍스트 포스트 발행
   */
  async publishWithImage(
    text: string,
    imageUrl: string,
    link?: string
  ): Promise<PublishResult> {
    try {
      const content = link ? `${text}\n\n${link}` : text;

      const createRes = await fetch(
        `https://graph.threads.net/v1.0/${this.config.userId}/threads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'IMAGE',
            image_url: imageUrl,
            text: content,
            access_token: this.config.accessToken,
          }),
        }
      );
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message);

      const publishRes = await fetch(
        `https://graph.threads.net/v1.0/${this.config.userId}/threads_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: createData.id,
            access_token: this.config.accessToken,
          }),
        }
      );
      const publishData = await publishRes.json();
      if (publishData.error) throw new Error(publishData.error.message);

      return {
        success: true,
        postId: publishData.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
