<?php

namespace App\Repository;

use App\Entity\Phone;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Phone>
 */
class PhoneRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Phone::class);
    }

    /**
     * Case-insensitive search over the canonical phone list.
     *
     * @return Phone[]
     */
    public function search(?string $q): array
    {
        $qb = $this->createQueryBuilder('p')
            ->orderBy('p.brand', 'ASC')
            ->addOrderBy('p.model', 'ASC');

        if ($q !== null && trim($q) !== '') {
            $qb->andWhere('LOWER(p.brand) LIKE :q OR LOWER(p.model) LIKE :q')
                ->setParameter('q', '%' . strtolower(trim($q)) . '%');
        }

        return $qb->getQuery()->getResult();
    }
}
