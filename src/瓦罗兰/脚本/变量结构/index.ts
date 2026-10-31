import { registerMvuSchema } from '../../运行/mvu-schema';
import { Schema } from '../../schema';

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    registerMvuSchema(Schema);
    console.info('[瓦洛兰] MVU 变量结构已注册');
  })();
});
