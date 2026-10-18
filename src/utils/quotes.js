/**
 * One quote a day on Home: the web, design, and getting things done.
 *
 * Every attribution here is one the speaker is on record for. Popular lines
 * that are usually misattributed (most "Einstein" and "da Vinci" quotes)
 * were left out on purpose — a wrong name under a quote reads as careless.
 */
export const QUOTES = [
  ["The web does not just connect machines, it connects people.", "Tim Berners-Lee"],
  ["The power of the Web is in its universality.", "Tim Berners-Lee"],
  ["The future is still so much bigger than the past.", "Tim Berners-Lee"],
  ["Content precedes design. Design in the absence of content is not design, it's decoration.", "Jeffrey Zeldman"],
  ["Good design is as little design as possible.", "Dieter Rams"],
  ["Design is not just what it looks like and feels like. Design is how it works.", "Steve Jobs"],
  ["The details are not the details. They make the design.", "Charles Eames"],
  ["Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.", "Antoine de Saint-Exupéry"],
  ["Simplicity is prerequisite for reliability.", "Edsger W. Dijkstra"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", "Martin Fowler"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["Focus is a matter of deciding what things you're not going to do.", "John Carmack"],
  ["Plans are worthless, but planning is everything.", "Dwight D. Eisenhower"],
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant"],
  ["The best way out is always through.", "Robert Frost"],
  ["Lost time is never found again.", "Benjamin Franklin"],
  ["You can't use up creativity. The more you use, the more you have.", "Maya Angelou"],
  ["Start where you are. Use what you have. Do what you can.", "Arthur Ashe"],
];

const DAY_MS = 86_400_000;

/** The same quote all day, a different one tomorrow, in the person's own time zone. */
export const quoteFor = (date = new Date()) => {
  const localDay = Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / DAY_MS);
  const [text, author] = QUOTES[((localDay % QUOTES.length) + QUOTES.length) % QUOTES.length];
  return { text, author };
};
