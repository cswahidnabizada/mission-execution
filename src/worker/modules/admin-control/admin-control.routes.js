import {registerAdminAccessRoutes} from './admin-access.routes.js';
import {registerAdminBuildDataRoutes} from './admin-build-data.routes.js';
import {registerAdminVerificationCompanyRoutes} from './admin-verification-company.routes.js';
import {registerAdminGovernanceRoutes} from './admin-governance.routes.js';
import {registerAdminLaunchConfigRoutes} from './admin-launch-config.routes.js';
import {registerAdminOperationsRoutes} from './admin-operations.routes.js';
import {registerAdminHumanPlatformRoutes} from './admin-human-platform.routes.js';
import {registerSuperAdminOperatingSystemRoutes} from './super-admin-operating-system.routes.js';
import {registerInfrastructureGovernanceRoutes} from './infrastructure-governance.routes.js';
import {registerAdminUserExperienceRoutes} from './admin-user-experience.routes.js';
import {registerProductIdentityRoutes} from './product-identity.routes.js';
import {registerInfrastructureResourceRoutes} from './infrastructure-resource.routes.js';

export function registerAdminControlRoutes(router){
  registerAdminAccessRoutes(router);
  registerAdminBuildDataRoutes(router);
  registerAdminVerificationCompanyRoutes(router);
  registerAdminGovernanceRoutes(router);
  registerAdminLaunchConfigRoutes(router);
  registerAdminOperationsRoutes(router);
  registerAdminHumanPlatformRoutes(router);
  registerSuperAdminOperatingSystemRoutes(router);
  registerInfrastructureGovernanceRoutes(router);
  registerInfrastructureResourceRoutes(router);
  registerAdminUserExperienceRoutes(router);
  registerProductIdentityRoutes(router);
}
