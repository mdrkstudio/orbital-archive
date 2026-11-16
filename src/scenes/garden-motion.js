// Shared by the point tissue and both membrane layers.
export const gardenSwimGLSL = `
  attribute vec4 aOrganism;
  vec3 gardenSwim(vec3 p,float time){
    if(aOrganism.w<.001)return p;
    vec3 local=p-aOrganism.xyz;
    float radius=aOrganism.w;
    float phase=aOrganism.x*1.7+aOrganism.z*.8;
    float beat=sin(time*1.65+phase);
    float bell=smoothstep(-radius*.25,radius*.12,local.y);
    local.xz*=1.+beat*.095*bell;
    local.y+=beat*radius*.10*bell;
    float trail=clamp(-local.y/(radius*2.),0.,1.);
    local.x+=sin(time*1.35-trail*4.+phase)*trail*radius*.24;
    local.z+=cos(time*1.1-trail*3.+phase)*trail*radius*.16;
    return aOrganism.xyz+local+vec3(sin(time*.31+phase)*.22,
      sin(time*.48+phase)*.30+beat*.045,cos(time*.26+phase)*.10);
  }
`;
