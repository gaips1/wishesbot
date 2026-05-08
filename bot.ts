import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import * as fs from "fs";
import * as path from "path";

const DB_FILE = path.join(__dirname, "wishes.json");

interface Wish {
    id: string;
    userId: number;
    name: string;
    price: number;
    link: string;
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
        "Сохраняй сюда всё, что хочешь приобрести!\n" +
        "Жми /help, чтобы узнать список команд.",
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

    let msg = `📋 **Твои желания:**\n\n`;
    wishes.forEach((w, i) => {
        const linkStr = w.link ? `[🔗](${w.link})` : "";
        msg += `${i + 1}. **${w.name}** ${linkStr}\n└ ${w.price} ₽\n\n`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown" });
});

bot.command("stats", async (ctx) => {
    const wishes = loadDB().filter(w => w.userId === ctx.from?.id);
    if (wishes.length === 0) return ctx.reply("Твой список пока пуст. /add");

    const total = wishes.length;
    const totalPrice = wishes.reduce((sum, w) => sum + w.price, 0);

    let msg = `📊 **Твоя статистика:**\n\n`;
    msg += `Всего желаний: **${total}**\n`;
    msg += `Общая сумма: **${totalPrice.toLocaleString('ru-RU')} ₽**\n`;

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
        ctx.session.step = "awaiting_price";
        await ctx.reply("Введи примерную цену:");
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
        
        const newWish: Wish = {
            id: Date.now().toString(),
            userId: ctx.from.id,
            name: ctx.session.draftWish.name!,
            price: ctx.session.draftWish.price!,
            link: ctx.session.draftWish.link!,
            dateAdded: Date.now()
        };

        const db = loadDB();
        db.push(newWish);
        saveDB(db);

        ctx.session.step = "idle";
        ctx.session.draftWish = {};

        await ctx.reply(`✅ **Сохранено!**\n\n📌 ${newWish.name}\n💰 ${newWish.price} ₽`, { parse_mode: "Markdown" });
    }
});

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (data.startsWith("del_")) {
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