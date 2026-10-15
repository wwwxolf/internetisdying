-- World_001 Chicken Eats the Internet: additive avatar origins.
-- Keep legacy Human/Bot/Alien/Glitch rows valid and immutable.
ALTER TABLE public.iid_profiles
  DROP CONSTRAINT iid_profiles_origin_valid,
  ADD CONSTRAINT iid_profiles_origin_valid
  CHECK (origin IN (
    'HUMAN', 'BOT', 'ALIEN', 'GLITCH',
    'BOT_CHICKEN', 'CHICKEN_MUTANT', 'EGG_GLITCH'
  ));
