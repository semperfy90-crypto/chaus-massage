# Полноценный сайт записи на массаж — production-версия

Сайт использует Supabase для постоянного хранения записей и Telegram-бота для уведомлений.

## 1. Supabase
Создайте бесплатный проект в Supabase и откройте SQL Editor.
Вставьте содержимое `supabase.sql` и выполните.

Затем в Project Settings → API возьмите:
- Project URL → `SUPABASE_URL`
- service_role key → `SUPABASE_SERVICE_ROLE_KEY`

Service-role key является секретом. Не публикуйте его и не помещайте в браузер.

## 2. Telegram
В Telegram откройте @BotFather → `/newbot`, создайте бота и получите токен.
Токен храните как пароль.

После запуска сайта откройте созданного бота и отправьте `/start`.
Сайт автоматически запомнит chat ID в таблице settings. Вручную chat ID вводить не нужно.

## 3. Размещение
Проект рассчитан на Node.js 18+ и подходит для Render Web Service.
Build Command: `npm install`
Start Command: `npm start`

На Render добавьте переменные:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_PASSWORD`

Render выдаёт публичный `onrender.com` адрес и поддерживает пользовательский домен.

## 4. Админка
После запуска: `/admin.html`
Пароль — значение `ADMIN_PASSWORD`.

## 5. Важно
Не используйте старое хранение `data/bookings.json` для продакшена: файловая система бесплатного Render непостоянна. Эта версия хранит записи в Supabase.
