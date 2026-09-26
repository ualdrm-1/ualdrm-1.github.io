<?php
/* ---------------------------------------------------------------------------
   Приём заявок с формы на главной: JSON {name, phone, message, consent, page, sentAt}
   → письмо на почту компании. Работает на встроенной почте Beget (mail()).
   --------------------------------------------------------------------------- */
date_default_timezone_set('Europe/Moscow');

const MAIL_TO   = 'sfera.89@bk.ru';
const MAIL_FROM = 'noreply@xn--80aaadafumkxn4adbq2bfd5jza.xn--p1ai';

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function reply($code, $msg) {
  http_response_code($code);
  echo json_encode(['ok' => $code === 200, 'message' => $msg], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, 'Method not allowed');

$data = json_decode((string) file_get_contents('php://input', false, null, 0, 10000), true);
if (!is_array($data)) reply(400, 'Bad request');

$clean = function ($v, $max) {
  $v = trim((string) preg_replace('/\s+/u', ' ', (string) $v));
  return preg_match('/^.{0,' . $max . '}/us', $v, $m) ? $m[0] : '';
};

$name  = $clean(isset($data['name']) ? $data['name'] : '', 100);
$phone = $clean(isset($data['phone']) ? $data['phone'] : '', 40);
$page  = $clean(isset($data['page']) ? $data['page'] : '', 300);
// «Коротко об объекте»: переносы строк сохраняем — конфигуратор пишет состав защиты списком
$msg   = isset($data['message']) ? trim(preg_replace('/[^\S\n]+/u', ' ', str_replace("\r", '', (string) $data['message']))) : '';
$msg   = preg_match('/^.{0,2000}/us', $msg, $m) ? $m[0] : '';

if (!empty($data['website'])) reply(200, 'OK'); // ловушка для ботов
if ($name === '' || empty($data['consent'])) reply(422, 'Заполните обязательные поля');
if (strlen(preg_replace('/\D/', '', $phone)) < 10) reply(422, 'Проверьте номер телефона');

// не больше одной заявки в 30 секунд с одного IP
$ip   = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
$lock = sys_get_temp_dir() . '/sfera_req_' . md5($ip);
if (is_file($lock) && time() - filemtime($lock) < 30) reply(429, 'Слишком часто, попробуйте через минуту');

$body = "Новая заявка с сайта защитаобъектовотбпла.рф\n\n"
      . "Имя: {$name}\n"
      . "Телефон: {$phone}\n"
      . ($msg !== '' ? "\nОб объекте:\n{$msg}\n\n" : '')
      . "Согласие на обработку ПДн: да\n"
      . "Страница: {$page}\n"
      . 'Время: ' . date('d.m.Y H:i') . " (МСК)\n"
      . "IP: {$ip}\n";

$headers = implode("\r\n", [
  'From: =?UTF-8?B?' . base64_encode('Сайт «Защита от БПЛА»') . '?= <' . MAIL_FROM . '>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
]);

$subject = '=?UTF-8?B?' . base64_encode("Заявка: {$name}, {$phone}") . '?=';

if (!mail(MAIL_TO, $subject, $body, $headers, '-f' . MAIL_FROM)) reply(500, 'Не удалось отправить');
@touch($lock); // только после успешной отправки, чтобы сбой не блокировал повтор
reply(200, 'OK');
