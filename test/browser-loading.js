/**
 * Created by colinhan on 22/03/2017.
 */

var assert = chai.assert;

describe('load browser module', ()=>{
  const client = p2m.message.client;
  it('should has start() method', ()=> {
    assert.typeOf(client.start, 'function');
  });
  it('should has stop() method', ()=> {
    assert.typeOf(client.stop, 'function');
  });
});
