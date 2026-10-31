import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyCallLimit} from '../api/integrations/david/[action].js';

test('DAVID daily call cap stays at two even if assignment is larger',()=>{
 assert.equal(dailyCallLimit({target_calls:1}),1);
 assert.equal(dailyCallLimit({target_calls:2}),2);
 assert.equal(dailyCallLimit({target_calls:8}),2);
 assert.equal(dailyCallLimit({target_calls:0}),0);
 assert.equal(dailyCallLimit(null),0);
});
