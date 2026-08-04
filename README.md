# Кошница — онлайн магазин

Малък Node.js/Express онлайн магазин на български с каталог, кошница, админ панел и избор на точка за получаване.

## Доставка

- **Econt:** градове и офиси се зареждат от Econt Nomenclatures API.
- **Speedy:** населените места и офисите се търсят през Speedy REST API. Необходимите данни се пазят само в `.env`. Официална документация: `https://api.speedy.bg/web-api.html`.
- **BOX NOW:** клиентът избира автомат през официалния BOX NOW map widget. За самия избор на автомат не е нужен BOX NOW API secret. Документация: `https://boxnow.bg/diy/eshops/api`.

В поръчката се запазват текстът на офиса/автомата и неговият `locationId`, когато куриерът го предоставя.

## Локално стартиране

Изисква Node.js 18 или по-нова версия.

```bash
npm install
cp .env.example .env
```

Попълни `.env`:

```env
PORT=3000
ADMIN_PASSWORD=сложна-уникална-парола
SPEEDY_API_USERNAME=твоят-speedy-потребител
SPEEDY_API_PASSWORD=твоята-speedy-парола
```

След това:

```bash
npm start
```

Отвори `http://localhost:3000`. Админ панелът е на `http://localhost:3000/admin`; видим бутон в основната навигация няма. Годината в долния колонтитул е дискретен линк към същия адрес.

## Проверка на проекта

```bash
npm test
```

Проверката валидира JSON файловете, отделния `styles.css`, JavaScript синтаксиса в `index.html` и потвърждава, че `.env` и `node_modules` не са в папката за публикуване. GitHub Actions изпълнява същата проверка при push.

## Качване в GitHub

1. Създай празно repository в GitHub, например `koshnitsa-shop`. Не добавяй README или `.gitignore` от GitHub, защото те вече са в проекта.
2. В PowerShell отвори папката на проекта и изпълни:

```powershell
git init
git add .
git commit -m "Initial Koshnitsa shop"
git branch -M main
git remote add origin https://github.com/ТВОЕТО-ИМЕ/koshnitsa-shop.git
git push -u origin main
```

`.env` е игнориран и няма да бъде качен. API паролите трябва да се добавят като environment variables в хостинг платформата, не в GitHub.

## Структура

```text
public/index.html      HTML и frontend логика
public/styles.css     отделен CSS файл
server.js              Express API
data/products.json     продукти
data/orders.json       поръчки
scripts/check.js       локални и CI проверки
.github/workflows/      GitHub Actions
.env.example           примерни настройки без тайни
```

## Важно за реален магазин

JSON файловете са подходящи за демо и локален прототип. При повече поръчки или deployment върху услуга с временна файлова система използвай база данни.

## Скрит админ адрес

Админ бутонът е премахнат от горната навигация. Панелът се отваря директно през `/admin` или чрез дискретния линк върху годината `2026` във footer-а. Това само скрива входа от обикновените посетители — реалната защита остава `ADMIN_PASSWORD`.
