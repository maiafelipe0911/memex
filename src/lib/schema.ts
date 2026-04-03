import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  vector,
} from "drizzle-orm/pg-core";

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const highlights = pgTable("highlights", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id")
    .references(() => books.id)
    .notNull(),
  content: text("content").notNull(),
  page: text("page"),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
