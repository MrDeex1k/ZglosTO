import { eslintCompatPlugin } from '@oxlint/plugins';

import { noChainedTypeAssertionsRule } from './rules/no-chained-type-assertions.ts';
import { noWidenThenAssertRule } from './rules/no-widen-then-assert.ts';
import { noReduceAccumulatorCopyRule } from './rules/no-reduce-accumulator-copy.ts';
import { requireSafetyCommentForTypeAssertionRule } from './rules/require-safety-comment-for-type-assertion.ts';

export default eslintCompatPlugin({
  meta: { name: 'anti-slop' },
  rules: {
    'no-chained-type-assertions': noChainedTypeAssertionsRule,
    'no-widen-then-assert': noWidenThenAssertRule,
    'no-reduce-accumulator-copy': noReduceAccumulatorCopyRule,
    'require-safety-comment-for-type-assertion': requireSafetyCommentForTypeAssertionRule,
  },
});
