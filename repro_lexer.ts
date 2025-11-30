import { Lexer, TokenType } from './src/lexer';

const input = `@meta {{
  title: "Home"
}}`;

console.log('Testing Lexer with input:', JSON.stringify(input));

const lexer = new Lexer(input);
const tokens = lexer.tokenize();

console.log('Tokens:', tokens.map(t => ({ type: TokenType[t.type], value: t.value })));

const expected = [TokenType.META, TokenType.OPEN_TAG];
if (tokens[0].type === TokenType.META && tokens[1].type === TokenType.OPEN_TAG) {
    console.log('PASS: Lexer correctly skipped whitespace.');
} else {
    console.log('FAIL: Lexer did not skip whitespace correctly.');
}
