<?php

namespace App\Command;

use App\Entity\Phone;
use App\Repository\PhoneRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(name: 'app:seed-phones', description: 'Seed the phone catalog if it is empty')]
class SeedPhonesCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PhoneRepository $phones,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);

        if (count($this->phones->findAll()) > 0) {
            $io->note('Catalog already populated; skipping.');

            return Command::SUCCESS;
        }

        $seed = [
            ['Apple', 'iPhone 15 Pro', 2023, ['128GB', '256GB', '512GB', '1TB']],
            ['Apple', 'iPhone 15', 2023, ['128GB', '256GB', '512GB']],
            ['Samsung', 'Galaxy S24 Ultra', 2024, ['256GB', '512GB', '1TB']],
            ['Samsung', 'Galaxy S24', 2024, ['128GB', '256GB']],
            ['Google', 'Pixel 8 Pro', 2023, ['128GB', '256GB', '512GB']],
            ['Google', 'Pixel 8', 2023, ['128GB', '256GB']],
            ['OnePlus', '12', 2024, ['256GB', '512GB']],
            ['Nothing', 'Phone (2)', 2023, ['128GB', '256GB']],
        ];

        foreach ($seed as [$brand, $model, $year, $storage]) {
            $phone = (new Phone())
                ->setBrand($brand)
                ->setModel($model)
                ->setReleaseYear($year)
                ->setStorageOptions($storage);
            $this->em->persist($phone);
        }
        $this->em->flush();

        $io->success(sprintf('Seeded %d phones.', count($seed)));

        return Command::SUCCESS;
    }
}
