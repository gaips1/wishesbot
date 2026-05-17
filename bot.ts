import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import * as fs from "fs";
import * as path from "path";

const DB_FILE = path.join(__dirname, "wishes.json");

type Category = "Купить 🛒" | "Посмотреть 🎬" | "Попробовать 🍕" | "Посетить ✈️" | "Сделать 🎯";
type Priority = "Высокий 🔴" | "Средний 🟡" | "Низкий 🟢";

interface Wish {
    id: string;
    userId: number;
    name: string;
    category: Category;
    price: number;
    link: string;
    priority: Priority;
    dateAdded: number;
}

const loadDB = (): Wish[] => {
    if (!fs.existsSync(DB_FILE)) return [];
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
};

const saveDB = (data: Wish[]) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

interface SessionData {
    step: "idle" | "awaiting_name" | "awaiting_price" | "awaiting_link";
    draftWish: Partial<Wish>;
}

type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.TOKEN || "");

bot.use(session({
    initial: (): SessionData => ({ step: "idle", draftWish: {} })
}));

bot.command("start", async (ctx) => {
    await ctx.reply(
        "👋 Привет! Я твой личный **Wishlist Бот**.\n\n" +
        "Сохраняй сюда всё, что хочешь купить, посмотреть, попробовать или посетить!\n" +
        "Жми /help, чтобы узнать, что я умею.",
        { parse_mode: "Markdown" }
    );
});

bot.command("help", async (ctx) => {
    await ctx.reply(
        "📌 **Доступные команды:**\n\n" +
        "➕ /add — Добавить новое желание\n" +
        "📋 /list — Показать список желаний\n" +
        "📊 /stats — Статистика\n" +
        "❌ /delete — Удалить желание\n" +
        "🛑 /cancel — Отменить текущее действие",
        { parse_mode: "Markdown" }
    );
});

bot.command("cancel", async (ctx) => {
    ctx.session.step = "idle";
    ctx.session.draftWish = {};
    await ctx.reply("❌ Действие отменено.");
});

bot.command("add", async (ctx) => {
    ctx.session.step = "awaiting_name";
    ctx.session.draftWish = {};
    await ctx.reply("✍️ Напиши название твоего желания:", { parse_mode: "Markdown" });
});

bot.command("list", async (ctx) => {
    const wishes = loadDB().filter(w => w.userId === ctx.from?.id);
    if (wishes.length === 0) {
        return ctx.reply("У тебя пока нет желаний. Добавь первое: /add");
    }

    const kb = new InlineKeyboard()
        .text("🛒 Купить", "filter_buy")
        .text("🎬 Посмотреть", "filter_watch")
        .text("✈️ Посетить", "filter_visit").row()
        .text("🍕 Попробовать", "filter_try")
        .text("🎯 Сделать", "filter_do").row()
        .text("🌍 Показать всё", "filter_all");

    await ctx.reply("📋 **Твои желания:**\nВыберите фильтр:", { reply_markup: kb, parse_mode: "Markdown" });
});

bot.command("stats", async (ctx) => {
    const wishes = loadDB().filter(w => w.userId === ctx.from?.id);
    if (wishes.length === 0) return ctx.reply("Твой список пока пуст. /add");

    const total = wishes.length;
    const totalPrice = wishes.reduce((sum, w) => sum + w.price, 0);
    const byCategory = wishes.reduce((acc, w) => {
        acc[w.category] = (acc[w.category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    let msg = `📊 **Твоя статистика:**\n\n`;
    msg += `Всего желаний: **${total}**\n`;
    msg += `Общая сумма: **${totalPrice.toLocaleString('ru-RU')} ₽**\n\n`;
    msg += `📂 **По категориям:**\n`;
    for (const [cat, count] of Object.entries(byCategory)) {
        msg += `${cat}: ${count}\n`;
    }

    await ctx.reply(msg, { parse_mode: "Markdown" });
});

bot.command("delete", async (ctx) => {
    const wishes = loadDB().filter(w => w.userId === ctx.from?.id);
    if (wishes.length === 0) return ctx.reply("Нечего удалять 🤷‍♂️");

    const kb = new InlineKeyboard();
    wishes.forEach((w) => {
        kb.text(`❌ ${w.name}`, `del_${w.id}`).row();
    });

    await ctx.reply("Нажми на элемент для удаления:", { reply_markup: kb });
});

bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const step = ctx.session.step;

    if (step === "idle") return;

    if (step === "awaiting_name") {
        ctx.session.draftWish.name = text;
        const kb = new InlineKeyboard()
            .text("🛒 Купить", "cat_buy")
            .text("🎬 Посмотреть", "cat_watch").row()
            .text("🍕 Попробовать", "cat_try")
            .text("✈️ Посетить", "cat_visit").row()
            .text("🎯 Сделать", "cat_do");

        ctx.session.step = "idle";
        await ctx.reply(`Выбери категорию для "${text}":`, { reply_markup: kb });
    } 
    else if (step === "awaiting_price") {
        const price = parseFloat(text.replace(/\s/g, ''));
        if (isNaN(price)) {
            return ctx.reply("❌ Введи только число. Если бесплатно — 0.");
        }
        ctx.session.draftWish.price = price;
        ctx.session.step = "awaiting_link";
        await ctx.reply("Пришли ссылку или '-' если её нет:");
    }
    else if (step === "awaiting_link") {
        ctx.session.draftWish.link = text === "-" ? "" : text;
        const kb = new InlineKeyboard()
            .text("🔴 Высокий", "prio_high").row()
            .text("🟡 Средний", "prio_med").row()
            .text("🟢 Низкий", "prio_low");

        ctx.session.step = "idle";
        await ctx.reply("Выбери приоритет:", { reply_markup: kb });
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (data.startsWith("cat_")) {
        const map: Record<string, Category> = {
            cat_buy: "Купить 🛒", cat_watch: "Посмотреть 🎬", 
            cat_try: "Попробовать 🍕", cat_visit: "Посетить ✈️", cat_do: "Сделать 🎯"
        };
        ctx.session.draftWish.category = map[data];
        ctx.session.step = "awaiting_price";
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(`Категория: ${map[data]}\n\nВведи примерную цену:`);
    }
    else if (data.startsWith("prio_")) {
        const map: Record<string, Priority> = {
            prio_high: "Высокий 🔴", prio_med: "Средний 🟡", prio_low: "Низкий 🟢"
        };
        ctx.session.draftWish.priority = map[data];
        
        const newWish: Wish = {
            id: Date.now().toString(),
            userId: userId,
            name: ctx.session.draftWish.name!,
            category: ctx.session.draftWish.category!,
            price: ctx.session.draftWish.price!,
            link: ctx.session.draftWish.link!,
            priority: ctx.session.draftWish.priority!,
            dateAdded: Date.now()
        };

        const db = loadDB();
        db.push(newWish);
        saveDB(db);

        ctx.session.step = "idle";
        ctx.session.draftWish = {};

        await ctx.answerCallbackQuery("Сохранено!");
        await ctx.editMessageText(`✅ **Сохранено!**\n\n📌 ${newWish.name}\n💰 ${newWish.price} ₽\n🔥 Приоритет: ${newWish.priority}`, { parse_mode: "Markdown" });
    }
    else if (data.startsWith("filter_")) {
        const map: Record<string, Category | "all"> = {
            filter_buy: "Купить 🛒", filter_watch: "Посмотреть 🎬", 
            filter_try: "Попробовать 🍕", filter_visit: "Посетить ✈️", 
            filter_do: "Сделать 🎯", filter_all: "all"
        };
        
        const filter = map[data];
        let wishes = loadDB().filter(w => w.userId === userId);
        if (filter !== "all") wishes = wishes.filter(w => w.category === filter);

        if (wishes.length === 0) {
            await ctx.answerCallbackQuery("Пусто!");
            return;
        }

        let msg = `📋 **Список (${filter})**\n\n`;
        wishes.forEach((w, i) => {
            const linkStr = w.link ? `[🔗](${w.link})` : "";
            msg += `${i + 1}. **${w.name}** ${linkStr}\n└ ${w.price} ₽ • ${w.priority.split(' ')[1]}\n\n`;
        });

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(msg, { parse_mode: "Markdown" });
    }
    else if (data.startsWith("del_")) {
        const idToDelete = data.replace("del_", "");
        let db = loadDB();
        const wish = db.find(w => w.id === idToDelete && w.userId === userId);
        
        if (wish) {
            db = db.filter(w => w.id !== idToDelete);
            saveDB(db);
            await ctx.answerCallbackQuery("Удалено!");
            await ctx.editMessageText(`🗑 Удалено: **${wish.name}**`, { parse_mode: "Markdown" });
        } else {
            await ctx.answerCallbackQuery("Ошибка удаления");
        }
    }
});

bot.catch((err) => console.error(err));
bot.start();