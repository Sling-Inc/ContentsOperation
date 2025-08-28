import axios from "axios";
import { URLSearchParams } from "url";
import { Logger } from "#root/utils/logger.js";

/**
 * EBSi 사이트에 로그인하고 세션 쿠키를 반환합니다.
 * @param {string} userId
 * @param {string} password
 * @returns {Promise<string | null>} 로그인 성공 시 세션 쿠키 문자열, 실패 시 null
 */
export async function loginToEBSi(userId, password) {
  Logger.section("EBSi 로그인 시도");

  const loginUrl = "https://www.ebsi.co.kr/ebs/sso/loginGo";

  // 제공된 Form Data를 기반으로 payload를 구성합니다.
  // 실제 값으로 채워야 할 부분은 userId와 password 입니다.
  const formData = {
    returnUrl: "https://www.ebsi.co.kr/ebs/pot/poti/main.ebs",
    snsSite: "",
    scope: "openid",
    response_type: "code",
    redirect_uri:
      "https://www.ebsi.co.kr/ebs/sso/callback?returnUrl=https%3A%2F%2Fwww.ebsi.co.kr%2Febs%2Fpot%2Fpoti%2Fmain.ebs",
    // state 값은 동적으로 변할 수 있으나, 우선은 제공된 값으로 시도합니다.
    state: "725ca8df-d32c-4595-aede-1068edb3ce13",
    login: "true",
    login_uri: "https://www.ebsi.co.kr/ebs/sso/login",
    prompt: "login",
    client_id: "ebsi",
    i: userId,
    c: password, // 실제 요청에서는 암호화될 가능성이 높습니다.
  };

  // application/x-www-form-urlencoded 형식으로 변환
  const payload = new URLSearchParams(formData).toString();

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    Referer: "https://www.ebsi.co.kr/ebs/pot/potl/login.ebs",
    Origin: "https://www.ebsi.co.kr",
  };

  try {
    Logger.info(`로그인 요청 전송: ${loginUrl}`);
    const response = await axios.post(loginUrl, payload, {
      headers,
      // 리디렉션을 따라가지 않고, 첫 응답(302)을 그대로 받기 위함
      maxRedirects: 0,
      validateStatus: function (status) {
        // 302 Found 응답을 성공으로 처리
        return status >= 200 && status < 400;
      },
    });

    const cookies = response.headers["set-cookie"];

    if (cookies && cookies.length > 0) {
      const sessionCookies = cookies.join("; ");
      Logger.info("로그인 성공! 세션 쿠키를 획득했습니다.");
      Logger.debug(`쿠키: ${sessionCookies}`);
      Logger.endSection("EBSi 로그인 완료");
      return sessionCookies;
    } else {
      Logger.warn("로그인 실패: 세션 쿠키를 찾을 수 없습니다.");
      Logger.debug(`응답 헤더: ${JSON.stringify(response.headers, null, 2)}`);
      Logger.endSection(false);
      return null;
    }
  } catch (error) {
    Logger.error("로그인 중 오류 발생", error);
    Logger.endSection("EBSi 로그인 오류");
    return null;
  }
}
