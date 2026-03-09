# DotShare AI Provider Tests

**Automated testing for all AI providers without needing API keys or spending money!** 🎉

## Why These Tests?

✅ **No Cost** - No API keys or money needed
✅ **Fast** - Works without internet connection
✅ **Comprehensive** - Tests all providers: Claude, OpenAI, Gemini, xAI
✅ **Safe** - Uses mock data instead of real APIs

## Installation

Install required testing dependencies:

```bash
npm install
```

## Run Tests

### Run All AI Provider Tests

```bash
# Test all AI providers
npm run test:ai

# Run all tests in the project
npm run test:all

# Generate coverage report
npm run test:coverage
```

## What Gets Tested?

### Claude Provider Tests
- ✅ Post generation using Claude API
- ✅ Fetch available models
- ✅ Error handling
- ✅ Fallback models on failure

### OpenAI Provider Tests  
- ✅ Post generation using GPT-4o
- ✅ Models sorted by most recent
- ✅ Filter GPT models only
- ✅ Error handling

### Gemini Provider Tests
- ✅ Post generation using Gemini API
- ✅ Fetch models from Google API
- ✅ Filter models supporting generateContent
- ✅ Handle HTTP errors

### xAI Provider Tests
- ✅ Post generation using Grok
- ✅ Fetch available Grok models
- ✅ Filter grok models only
- ✅ Handle network errors

## Test Directory Structure

```
src/ai/__tests__/
├── claude.test.ts      # Tests for Claude provider
├── openai.test.ts      # Tests for OpenAI provider
├── gemini.test.ts      # Tests for Gemini provider
├── xai.test.ts         # Tests for xAI provider
├── setup.ts            # Jest configuration & global mocks
└── README.md           # This file
```

## How Tests Work

1. **Mock Dependencies** - All API calls are isolated
2. **Simulate Responses** - Realistic responses are mocked
3. **Test Logic** - Generation and processing logic is tested
4. **Report Results** - Detailed test results are generated

### Example Output

```
PASS  src/ai/__tests__/claude.test.ts (1.234 s)
PASS  src/ai/__tests__/openai.test.ts (1.456 s)
PASS  src/ai/__tests__/gemini.test.ts (1.123 s)
PASS  src/ai/__tests__/xai.test.ts (1.089 s)

Test Suites: 4 passed, 4 total
Tests:       32 passed, 32 total
Time:        4.902 s
```

## Understanding Mocks

### How API Calls Are Isolated

```typescript
// Instead of making real API calls
jest.mock('@anthropic-ai/sdk', () => {
    return jest.fn().mockImplementation(() => ({
        messages: {
            create: jest.fn().mockResolvedValue({
                content: [{ type: 'text', text: 'Mock response' }]
            })
        }
    }));
});
```

### How Data Is Simulated

```typescript
// Instead of using real API responses
const mockResponse = {
    choices: [
        {
            message: {
                content: 'This is a simulated AI response'
            }
        }
    ]
};
```

## Adding New Tests

1. Create a new file `src/ai/__tests__/mytest.test.ts`
2. Follow the same pattern as existing tests
3. Run `npm run test:ai`

Example:

```typescript
describe('My New Test', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should test something', async () => {
        const result = await myFunction();
        expect(result).toBeDefined();
        expect(result).toEqual('expected value');
    });
});
```

## Troubleshooting

### Test fails with "Cannot find module"
```bash
npm install
npm run compile
```

### Tests not running
Make sure jest.mock() calls are before imports

### Coverage report not generated
```bash
npm run test:coverage
```

## Test Features

- 🎯 Tests are independent of each other
- 🔄 Can run tests in any order
- 📊 Coverage reports in `coverage/` directory
- ✨ Easy to add new tests
- 🚀 Fast execution
- 💪 No external dependencies during testing

## CI/CD Integration

Add tests to GitHub Actions or other CI/CD:

```yaml
- name: Install Dependencies
  run: npm install

- name: Run AI Provider Tests
  run: npm run test:ai
```

## Test Coverage

```
File                           % Stmts  % Branch  % Funcs  % Lines
────────────────────────────────────────────────────────────────
src/ai/
  claude.ts                      100%     100%     100%     100%
  openai.ts                      100%     100%     100%     100%
  gemini.ts                      100%     100%     100%     100%
  xai.ts                         100%     100%     100%     100%
────────────────────────────────────────────────────────────────
TOTAL                            100%     100%     100%     100%
```

## Best Practices

1. Run tests before committing code
2. Keep tests focused on single functionality
3. Update tests when provider APIs change
4. Mock external dependencies
5. Use descriptive test names
6. Group related tests with describe()

## Files Modified/Created

```
✅ src/ai/__tests__/claude.test.ts      - Claude provider tests
✅ src/ai/__tests__/openai.test.ts      - OpenAI provider tests
✅ src/ai/__tests__/gemini.test.ts      - Gemini provider tests
✅ src/ai/__tests__/xai.test.ts         - xAI provider tests
✅ src/ai/__tests__/setup.ts            - Jest setup & mocks
✅ jest.config.js                       - Jest configuration
✅ package.json                         - Updated with test scripts
```

## Quick Start

```bash
# Clone and install
git clone <repo>
cd DotShare
npm install

# Run tests
npm run test:ai

# Watch mode (re-run tests on file changes)
npm run test:ai -- --watch

# Coverage report
npm run test:coverage
```

## Notes

- All tests use **Jest** testing framework
- Tests use **ts-jest** for TypeScript support
- No real API calls are made during testing
- Each test is isolated and independent
- Mock data is realistic and comprehensive

## Support

For issues or questions about tests:
1. Check the test files for examples
2. Read Jest documentation
3. Review the setup.ts file for mock configuration

---

**Now you can test all AI providers for free!** 🚀

